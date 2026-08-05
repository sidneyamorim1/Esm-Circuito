// Netlify Serverless Function — Proxy seguro para Azure AI Foundry
// A chave API fica APENAS no servidor (env var), nunca no navegador.

export default async (request, context) => {
  // Apenas aceitar POST
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { prompt, circuitContext } = body;

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt é obrigatório' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Netlify.env.get('VITE_AZURE_FOUNDRY_KEY') || '';
    const endpoint = Netlify.env.get('VITE_AZURE_FOUNDRY_ENDPOINT') || 'https://eletronica-sem-mimimi.services.ai.azure.com/api/projects/proj-eletronica';

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Chave de API do Azure AI Foundry não configurada no servidor.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const systemInstruction = `Você é o ESM IA, um assistente especialista em engenharia elétrica, eletrônica, física de semicondutores e simulação de circuitos.
Você está integrado a um simulador de circuitos interativo. O usuário monta circuitos na board e você recebe o estado completo do circuito (componentes, valores, conexões e simulação) como contexto.

REGRAS:
1. SEMPRE analise o contexto do circuito fornecido — ele contém os componentes reais, seus valores, as conexões entre terminais e o estado da simulação.
2. Ao DIAGNOSTICAR: identifique erros de montagem, componentes sem conexão, valores inadequados (resistores muito baixos, tensões excessivas), ausência de GND, LEDs sem resistor limitador, curtos-circuitos e componentes queimados. Sugira correções específicas com valores numéricos.
3. Ao EXPLICAR: descreva o funcionamento do circuito real montado, explicando o papel de cada componente, o percurso da corrente, as tensões esperadas em cada nó e os princípios teóricos (Lei de Ohm, Kirchhoff, divisor de tensão, etc).
4. Responda SEMPRE em Português do Brasil (PT-BR), de forma clara, didática e motivadora.
5. Use formatação markdown (negritos, listas, tabelas e LaTeX simples para fórmulas como $I = \\frac{V}{R}$).
6. Se o circuito estiver vazio, oriente o usuário a adicionar componentes pela biblioteca.`;

    const cleanEndpoint = endpoint.replace(/\/$/, '').split('?')[0];
    const deployment = 'proj-eletronica';

    const headers = {
      'Content-Type': 'application/json',
      'api-key': apiKey,
      'Authorization': `Bearer ${apiKey}`,
    };

    const agentHeaders = {
      ...headers,
      'OpenAI-Beta': 'assistants=v2',
    };

    const userMessage = `${systemInstruction}\n\nContexto do Circuito Atual do Usuário:\n${circuitContext || 'Nenhum circuito montado.'}\n\nPergunta do Usuário:\n${prompt}`;

    // --- ESTRATÉGIA 1: Azure AI Agent Service (Assistants API) ---
    const agentApiVersions = [
      '2024-10-21',
      '2024-05-01-preview',
      '2024-02-15-preview',
      '2024-08-01-preview',
      '2024-10-01-preview',
      '2024-06-01',
      '2024-12-01-preview',
      '2025-01-01-preview',
    ];

    for (const ver of agentApiVersions) {
      for (const h of [agentHeaders, headers]) {
        try {
          const threadUrl = `${cleanEndpoint}/threads?api-version=${ver}`;
          const threadRes = await fetch(threadUrl, {
            method: 'POST',
            headers: h,
            body: JSON.stringify({
              messages: [{ role: 'user', content: userMessage }],
            }),
          });

          if (threadRes.ok) {
            const threadData = await threadRes.json();
            const threadId = threadData.id;

            if (threadId) {
              const runRes = await fetch(`${cleanEndpoint}/threads/${threadId}/runs?api-version=${ver}`, {
                method: 'POST',
                headers: h,
                body: JSON.stringify({ assistant_id: deployment }),
              });

              if (runRes.ok) {
                const runData = await runRes.json();
                const runId = runData.id;

                // Poll para conclusão (max 30s)
                for (let attempt = 0; attempt < 30; attempt++) {
                  await new Promise(r => setTimeout(r, 1000));
                  const statusRes = await fetch(`${cleanEndpoint}/threads/${threadId}/runs/${runId}?api-version=${ver}`, { headers: h });
                  if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    if (statusData.status === 'completed') {
                      const msgsRes = await fetch(`${cleanEndpoint}/threads/${threadId}/messages?api-version=${ver}`, { headers: h });
                      if (msgsRes.ok) {
                        const msgsData = await msgsRes.json();
                        const assistantMsgs = (msgsData.data || []).filter(m => m.role === 'assistant');
                        if (assistantMsgs.length > 0) {
                          const content = assistantMsgs[0].content;
                          if (Array.isArray(content)) {
                            const textPart = content.find(p => p.type === 'text');
                            if (textPart?.text?.value) {
                              return new Response(JSON.stringify({ response: textPart.text.value }), {
                                headers: { 'Content-Type': 'application/json' },
                              });
                            }
                          }
                          if (typeof content === 'string') {
                            return new Response(JSON.stringify({ response: content }), {
                              headers: { 'Content-Type': 'application/json' },
                            });
                          }
                        }
                      }
                    } else if (statusData.status === 'failed' || statusData.status === 'cancelled') {
                      break;
                    }
                  }
                }
              }
            }
          }
        } catch {
          // Tentar próxima versão
        }
      }
    }

    // --- ESTRATÉGIA 2: Chat Completions API ---
    const chatVersions = ['2024-10-21', '2024-06-01', '2024-02-01', '2024-08-01-preview', '2024-10-01-preview', '2025-01-01-preview'];
    const chatPaths = [
      `${cleanEndpoint}/openai/deployments/${deployment}/chat/completions`,
      `${cleanEndpoint}/chat/completions`,
      `${cleanEndpoint}/openai/chat/completions`,
    ];

    for (const chatPath of chatPaths) {
      for (const ver of chatVersions) {
        try {
          const chatRes = await fetch(`${chatPath}?api-version=${ver}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: `Contexto do Circuito:\n${circuitContext || 'Vazio'}\n\nPergunta:\n${prompt}` },
              ],
              max_tokens: 2048,
              temperature: 0.7,
            }),
          });

          if (chatRes.ok) {
            const chatData = await chatRes.json();
            const text = chatData.choices?.[0]?.message?.content;
            if (text) {
              return new Response(JSON.stringify({ response: text }), {
                headers: { 'Content-Type': 'application/json' },
              });
            }
          }
        } catch {
          // Tentar próxima combinação
        }
      }
    }

    return new Response(JSON.stringify({ error: 'Não foi possível obter resposta do agente ESM IA. Verifique o endpoint e a chave API no Netlify.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: `Erro interno do proxy: ${err.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/api/ai-proxy',
};
