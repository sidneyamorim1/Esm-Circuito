import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
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

  if (req.method !== 'GET') {
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
    return jsonResponse({ success: false, error: 'Apenas administradores podem listar usuários.' }, 403);
  }

  const { data, error } = await adminClient
    .from('profiles')
    .select('id, email, role, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return jsonResponse({ success: false, error: 'Não foi possível listar usuários.' }, 500);
  }

  return jsonResponse({
    success: true,
    users: (data || []).map((item) => ({
      id: item.id,
      email: item.email,
      role: item.role || 'user',
      createdAt: item.created_at
    }))
  });
});
