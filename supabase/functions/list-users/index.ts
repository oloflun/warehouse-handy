import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verify that caller is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check that user is admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !roleData) {
      throw new Error('Only admins can list users');
    }

    // Fetch all user roles with profiles, branches, and timestamps
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select(`
        user_id, 
        role,
        is_super_admin,
        is_limited,
        created_at,
        profiles!inner(
          first_name, 
          last_name,
          branches(name)
        )
      `)
      .order('created_at', { ascending: false });

    if (rolesError) throw rolesError;

    // Fetch user details from auth.users
    const { data: { users: authUsers }, error: usersError } = 
      await supabaseAdmin.auth.admin.listUsers();

    if (usersError) throw usersError;

    // Combine role data with user email, display name, branch, and activation status
    const usersWithRoles = roles?.map((roleEntry: any) => {
      const authUser = authUsers?.find(u => u.id === roleEntry.user_id);
      const profile = roleEntry.profiles;
      
      // Check if user is pending (invited but not confirmed)
      const isPending = authUser?.email_confirmed_at === null || 
                        authUser?.last_sign_in_at === null;
      
      return {
        id: roleEntry.user_id,
        email: authUser?.email || 'Unknown',
        display_name: profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown',
        role: roleEntry.role,
        is_super_admin: roleEntry.is_super_admin || false,
        is_limited: roleEntry.is_limited || false,
        branch_name: profile?.branches?.name || null,
        created_at: roleEntry.created_at,
        is_pending: isPending,
      };
    }) || [];

    return new Response(
      JSON.stringify({ users: usersWithRoles }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in list-users function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
