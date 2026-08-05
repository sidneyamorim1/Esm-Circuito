import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

function isAdminUser(user: { app_metadata?: Record<string, unknown> }, profile?: { role?: string } | null) {
  return profile?.role === 'admin' || user.app_metadata?.role === 'admin';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Método não permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse({ success: false, error: 'Supabase não configurado na função.' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ success: false, error: 'Não autenticado.' }, 401);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: callerData, error: callerError } = await userClient.auth.getUser();

  if (callerError || !callerData.user) {
    return jsonResponse({ success: false, error: 'Sessão inválida.' }, 401);
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: callerProfile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', callerData.user.id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse({ success: false, error: 'Não foi possível validar permissões.' }, 500);
  }

  if (!isAdminUser(callerData.user, callerProfile)) {
    return jsonResponse({ success: false, error: 'Apenas administradores podem criar usuários.' }, 403);
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const role = body?.role === 'admin' ? 'admin' : 'user';

  if (!name || !email || !password) {
    return jsonResponse({ success: false, error: 'Informe nome, e-mail e senha.' }, 400);
  }

  if (password.length < 6) {
    return jsonResponse({ success: false, error: 'A senha deve ter pelo menos 6 caracteres.' }, 400);
  }

  const { data: createdData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name }
  });

  if (createError || !createdData.user) {
    return jsonResponse({
      success: false,
      error: createError?.message || 'Não foi possível criar o usuário.'
    }, 400);
  }

  const { error: upsertError } = await adminClient.from('profiles').upsert({
    id: createdData.user.id,
    email: createdData.user.email || email,
    role,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });

  if (upsertError) {
    await adminClient.auth.admin.deleteUser(createdData.user.id);
    return jsonResponse({ success: false, error: 'Não foi possível definir as permissões do usuário.' }, 500);
  }

  return jsonResponse({
    success: true,
    user: {
      id: createdData.user.id,
      name,
      email: createdData.user.email || email,
      role
    }
  }, 201);
});
