import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { CircuitProject } from '../types/circuit';

export interface AuthUserData {
  id: string;
  name: string;
  email: string;
  role?: string;
}

// ----------------------------------------------------
// AUTENTICAÇÃO
// ----------------------------------------------------

export async function signUpUser(name: string, email: string, password: string, role: string = 'user'): Promise<{ user: AuthUserData | null; error: string | null }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { user: null, error: 'Supabase não está configurado. Verifique o arquivo .env.' };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role }
      }
    });

    if (error) {
      return { user: null, error: error.message };
    }

    if (!data.user) {
      return { user: null, error: 'Erro inesperado ao criar usuário.' };
    }

    const userData: AuthUserData = {
      id: data.user.id,
      name: data.user.user_metadata?.name || name,
      email: data.user.email || email,
      role: data.user.app_metadata?.role || data.user.user_metadata?.role || role
    };

    return { user: userData, error: null };
  } catch (err: any) {
    return { user: null, error: err.message || 'Erro ao realizar cadastro.' };
  }
}

async function fetchUserRole(userId: string, defaultRole: string = 'user'): Promise<string> {
  if (!isSupabaseConfigured() || !supabase) return defaultRole;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (data?.role) return data.role;
  } catch {
    // fallback
  }
  return defaultRole;
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

    let userRole = data.user.app_metadata?.role || data.user.user_metadata?.role;
    if (!userRole || userRole !== 'admin') {
      userRole = await fetchUserRole(data.user.id, userRole || 'user');
    }

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

  let userRole = session.user.app_metadata?.role || session.user.user_metadata?.role;
  if (!userRole || userRole !== 'admin') {
    userRole = await fetchUserRole(session.user.id, userRole || 'user');
  }

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
      callback({
        id: session.user.id,
        name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuário',
        email: session.user.email || '',
        role: session.user.app_metadata?.role || session.user.user_metadata?.role || 'user'
      });
    } else {
      callback(null);
    }
  });

  return { unsubscribe: () => subscription.unsubscribe() };
}

export async function listUsersFromProfiles(): Promise<Array<{ id: string; email: string; role: string; createdAt: string }>> {
  if (!isSupabaseConfigured() || !supabase) return [];
  try {
    const { data, error } = await supabase
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

// ----------------------------------------------------
// PERSISTÊNCIA DE PROJETOS NO BANCO DE DADOS
function isValidUUID(str: string): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function saveProjectToCloud(project: CircuitProject): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Supabase não configurado.' };
  }

  const { data: { session } } = await supabase.auth.getSession();
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
    const { error } = await supabase
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
  if (!isSupabaseConfigured() || !supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('project_data')
      .eq('id', id)
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
  if (!isSupabaseConfigured() || !supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, created_at, updated_at')
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
  if (!isSupabaseConfigured() || !supabase) {
    return false;
  }

  try {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

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
