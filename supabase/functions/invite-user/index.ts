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

    // Verify that caller is logged in
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
      throw new Error('Only admins can invite users');
    }

    const { email, role, firstName, lastName, branchId } = await req.json();

    if (!email || !firstName || !lastName) {
      throw new Error('Email, first name, and last name are required');
    }

    // Invite user via Supabase Admin API
    console.log('Attempting to invite user:', email);
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          invited_by: user.id,
          invited_at: new Date().toISOString()
        },
        redirectTo: `${req.headers.get('origin') || Deno.env.get('SUPABASE_URL')}/auth`
      }
    );

    if (inviteError) {
      console.error('Error inviting user:', inviteError);
      throw new Error('Failed to invite user. Please check the email address and try again.');
    }

    console.log('User invitation successful:', inviteData?.user?.id);

    // Add role for the new user
    if (inviteData?.user?.id) {
      const { error: roleInsertError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: inviteData.user.id,
          role: role || 'user',
          created_by: user.id
        });

      if (roleInsertError) {
        console.error('Error adding role:', roleInsertError);
      }

      // Create profile with first and last name and branch
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: inviteData.user.id,
          first_name: firstName,
          last_name: lastName,
          branch_id: branchId || null
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Invitation sent successfully. The user will receive an activation email.',
        user: inviteData.user,
        note: 'If the email is not received, check Supabase SMTP settings in Authentication > Email Templates'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in invite-user function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  }
});
