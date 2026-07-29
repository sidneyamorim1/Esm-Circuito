-- ==========================================
-- SCHEMA SUPABASE: ESM CIRCUITO (FAUSTAD)
-- ==========================================

-- 1. Criar Tabela de Projetos
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  project_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Habilitar Row Level Security (RLS) para Projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 3. Remover políticas antigas se existirem (para evitar erros ao re-executar)
DROP POLICY IF EXISTS "Usuários podem visualizar seus próprios projetos" ON public.projects;
DROP POLICY IF EXISTS "Usuários podem inserir seus próprios projetos" ON public.projects;
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios projetos" ON public.projects;
DROP POLICY IF EXISTS "Usuários podem deletar seus próprios projetos" ON public.projects;

-- 4. Criar Políticas de Acesso RLS para Projects
CREATE POLICY "Usuários podem visualizar seus próprios projetos"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir seus próprios projetos"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus próprios projetos"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus próprios projetos"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Índice para otimização de consultas por usuário
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);

-- 6. Função e Trigger para atualização automática de updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_projects_updated_at ON public.projects;
CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==========================================
-- 7. TABELA DE PERFIS DE USUÁRIO & PERMISSÕES (ADMIN / USER)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ler seus próprios perfis" ON public.profiles;
CREATE POLICY "Usuários podem ler seus próprios perfis"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Função segura para verificar se o usuário autenticado é admin sem depender
-- das policies da própria tabela profiles.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  )
  OR COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role'
  ) = 'admin';
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "Admins podem ler todos os perfis" ON public.profiles;
CREATE POLICY "Admins podem ler todos os perfis"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins podem inserir perfis" ON public.profiles;
CREATE POLICY "Admins podem inserir perfis"
  ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins podem atualizar perfis" ON public.profiles;
CREATE POLICY "Admins podem atualizar perfis"
  ON public.profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Trigger para criar perfil automaticamente ao cadastrar usuário no Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_app_meta_data->>'role', 'user'))
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- COMANDO PARA DEFINIR PERMISSÃO DE ADMIN:
-- Execute o código abaixo no SQL Editor substituindo o e-mail:
-- 
-- UPDATE auth.users
-- SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
-- WHERE email = 'seu-email@exemplo.com';
-- 
-- INSERT INTO public.profiles (id, email, role)
-- SELECT id, email, 'admin' FROM auth.users WHERE email = 'seu-email@exemplo.com'
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';
-- ==========================================
