import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { CircuitProject } from '../types/circuit';

export interface AuthUserData {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
}

const EDGE_FUNCTION_UNAVAILABLE_ERROR =
  'Função administrativa não publicada no Supabase. Publique a Edge Function admin-create-user antes de cadastrar usuários.';

// ----------------------------------------------------
// AUTENTICAÇÃO
// ----------------------------------------------------

export async function signUpUser(name: string, email: string, password: string, role: 'user' | 'admin' = 'user'): Promise<{ user: AuthUserData | null; error: string | null }> {
  const client = supabase;
  if (!isSupabaseConfigured() || !client) {
    return { user: null, error: 'Supabase não está configurado. Verifique o arquivo .env.' };
  }

  try {
    const { data, error } = await client.functions.invoke('admin-create-user', {
      body: { name, email, password, role }
    });

    if (error) {
      if (error.message?.includes('Failed to send a request to the Edge Function')) {
        return { user: null, error: EDGE_FUNCTION_UNAVAILABLE_ERROR };
      }
      return { user: null, error: error.message };
    }

    if (!data?.success || !data?.user) {
      return { user: null, error: data?.error || 'Erro inesperado ao criar usuário.' };
    }

    return { user: data.user as AuthUserData, error: null };
  } catch (err: any) {
    if (err.message?.includes('Failed to send a request to the Edge Function')) {
      return { user: null, error: EDGE_FUNCTION_UNAVAILABLE_ERROR };
    }
    return { user: null, error: err.message || 'Erro ao realizar cadastro.' };
  }
}

async function fetchUserRole(userId: string, appMetadata?: Record<string, unknown>): Promise<'user' | 'admin'> {
  if (!isSupabaseConfigured() || !supabase) return 'user';
  try {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (data?.role === 'admin') return 'admin';
  } catch {
    // fallback
  }
  if (appMetadata?.role === 'admin') return 'admin';
  return 'user';
}

export async function signInUser(email: string, password: string): Promise<{ user: AuthUserData | null; error: string | null }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { user: null, error: 'Supabase não está configurado. Verifique o arquivo .env.' };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: 'Usuário não encontrado.' };
    }

    const userRole = await fetchUserRole(data.user.id, data.user.app_metadata);

    const userData: AuthUserData = {
      id: data.user.id,
      name: data.user.user_metadata?.name || email.split('@')[0],
      email: data.user.email || email,
      role: userRole
    };

    return { user: userData, error: null };
  } catch (err: any) {
    return { user: null, error: err.message || 'Erro ao realizar login.' };
  }
}

export async function requestPasswordReset(email: string, redirectTo?: string): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase não está configurado. Verifique o arquivo .env.' };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  return {
    success: !error,
    error: error ? error.message : null
  };
}

export async function signOutUser(): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { error: null };
  }

  const { error } = await supabase.auth.signOut();
  return { error: error ? error.message : null };
}

export async function getCurrentUser(): Promise<AuthUserData | null> {
  if (!isSupabaseConfigured() || !supabase) {
    return null;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const userRole = await fetchUserRole(session.user.id, session.user.app_metadata);

  return {
    id: session.user.id,
    name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuário',
    email: session.user.email || '',
    role: userRole
  };
}

export function onAuthStateChange(callback: (user: AuthUserData | null) => void) {
  if (!isSupabaseConfigured() || !supabase) {
    return { unsubscribe: () => {} };
  }

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
    if (session?.user) {
      queueMicrotask(() => {
        getCurrentUser().then(callback).catch(() => callback(null));
      });
    } else {
      callback(null);
    }
  });

  return { unsubscribe: () => subscription.unsubscribe() };
}

export async function listUsersFromProfiles(): Promise<Array<{ id: string; email: string; role: string; createdAt: string }>> {
  const client = supabase;
  if (!isSupabaseConfigured() || !client) return [];
  try {
    const { data: functionData, error: functionError } = await client.functions.invoke('admin-list-users', {
      method: 'GET'
    });

    if (!functionError && functionData?.success && Array.isArray(functionData.users)) {
      return functionData.users;
    }

    if (functionError) {
      console.error('Erro ao listar usuários pela Edge Function:', functionError);
    }

    const { data, error } = await client
      .from('profiles')
      .select('id, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Erro ao listar perfis no Supabase:', error);
      return [];
    }

    return data.map((item: any) => ({
      id: item.id,
      email: item.email,
      role: item.role || 'user',
      createdAt: item.created_at
    }));
  } catch (err) {
    console.error('Erro ao listar perfis no Supabase:', err);
    return [];
  }
}

export async function updateUserPassword(
  userId: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const client = supabase;
  if (!isSupabaseConfigured() || !client) {
    return { success: false, error: 'Supabase não está configurado.' };
  }

  try {
    const { data, error } = await client.functions.invoke('admin-change-password', {
      body: { userId, password }
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      return { success: false, error: data?.error || 'Não foi possível atualizar a senha.' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao atualizar senha.' };
  }
}

// ----------------------------------------------------
// PERSISTÊNCIA DE PROJETOS NO BANCO DE DADOS
function isValidUUID(str: string): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function saveProjectToCloud(project: CircuitProject): Promise<{ success: boolean; error?: string }> {
  const client = supabase;
  if (!isSupabaseConfigured() || !client) {
    return { success: false, error: 'Supabase não configurado.' };
  }

  const { data: { session } } = await client.auth.getSession();
  if (!session?.user) {
    return { success: false, error: 'Usuário não autenticado.' };
  }

  const now = new Date().toISOString();
  
  // Garantir que o ID do projeto seja um UUID válido para o PostgreSQL
  let projectId = project.project.id;
  if (!projectId || !isValidUUID(projectId)) {
    projectId = crypto.randomUUID();
    project.project.id = projectId;
  }

  project.project.updatedAt = now;

  try {
    const { data: existingProject } = await client
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .maybeSingle();

    if (existingProject && existingProject.user_id !== session.user.id) {
      projectId = crypto.randomUUID();
      project.project.id = projectId;
    }

    const { error } = await client
      .from('projects')
      .upsert({
        id: projectId,
        user_id: session.user.id,
        name: project.project.name,
        project_data: project,
        updated_at: now
      }, { onConflict: 'id' });

    if (error) {
      console.error('Erro ao salvar projeto no Supabase:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function loadProjectFromCloud(id: string): Promise<CircuitProject | null> {
  const client = supabase;
  if (!isSupabaseConfigured() || !client) {
    return null;
  }

  const { data: { session } } = await client.auth.getSession();
  if (!session?.user) return null;

  try {
    const { data, error } = await client
      .from('projects')
      .select('project_data')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single();

    if (error || !data) {
      console.error('Erro ao carregar projeto do Supabase:', error);
      return null;
    }

    return data.project_data as CircuitProject;
  } catch (err) {
    console.error('Erro ao carregar projeto do Supabase:', err);
    return null;
  }
}

export async function listProjectsFromCloud(): Promise<Array<{ id: string; name: string; createdAt: string; updatedAt: string }>> {
  const client = supabase;
  if (!isSupabaseConfigured() || !client) {
    return [];
  }

  const { data: { session } } = await client.auth.getSession();
  if (!session?.user) return [];

  try {
    const { data, error } = await client
      .from('projects')
      .select('id, name, created_at, updated_at')
      .eq('user_id', session.user.id)
      .order('updated_at', { ascending: false });

    if (error || !data) {
      console.error('Erro ao listar projetos no Supabase:', error);
      return [];
    }

    return data.map((item: any) => ({
      id: item.id,
      name: item.name,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
  } catch (err) {
    console.error('Erro ao listar projetos no Supabase:', err);
    return [];
  }
}

export async function deleteProjectFromCloud(id: string): Promise<boolean> {
  const client = supabase;
  if (!isSupabaseConfigured() || !client) {
    return false;
  }

  const { data: { session } } = await client.auth.getSession();
  if (!session?.user) return false;

  try {
    const { error } = await client
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (error) {
      console.error('Erro ao deletar projeto do Supabase:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Erro ao deletar projeto no Supabase:', err);
    return false;
  }
}
