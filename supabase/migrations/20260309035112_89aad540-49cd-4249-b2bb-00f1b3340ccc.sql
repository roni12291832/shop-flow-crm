-- Allow super_admin to view all tenants
CREATE POLICY "Super admin can view all tenants"
ON public.tenants FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Allow super_admin to view all profiles
CREATE POLICY "Super admin can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Allow super_admin to view all clients
CREATE POLICY "Super admin can view all clients"
ON public.clients FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Allow super_admin to view all user_roles
CREATE POLICY "Super admin can view all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));
