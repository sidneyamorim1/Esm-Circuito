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
    global: {
      headers: {
        Authorization: authHeader
      }
    }
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ success: false, error: 'Sessão inválida.' }, 401);
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse({ success: false, error: 'Não foi possível validar permissões.' }, 500);
  }

  if (!isAdminUser(userData.user, profile)) {
    return jsonResponse({ success: false, error: 'Apenas administradores podem alterar senhas.' }, 403);
  }

  const body = await req.json().catch(() => null);
  const userId = String(body?.userId || '').trim();
  const password = String(body?.password || '').trim();

  if (!userId || !password) {
    return jsonResponse({ success: false, error: 'Informe usuário e nova senha.' }, 400);
  }

  if (password.length < 6) {
    return jsonResponse({ success: false, error: 'A senha deve ter pelo menos 6 caracteres.' }, 400);
  }

  const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    password
  });

  if (updateError || !updatedUser.user) {
    return jsonResponse({
      success: false,
      error: updateError?.message || 'Não foi possível atualizar a senha.'
    }, 400);
  }

  return jsonResponse({
    success: true,
    user: {
      id: updatedUser.user.id,
      email: updatedUser.user.email
    }
  });
});
