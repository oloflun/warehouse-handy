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

    // Determine the proper redirect URL for email activation
    // Priority: 1) Request origin, 2) SITE_URL env var, 3) SUPABASE_URL as fallback
    const origin = req.headers.get('origin') || 
                   Deno.env.get('SITE_URL') || 
                   Deno.env.get('SUPABASE_URL');
    
    if (!origin) {
      throw new Error('Unable to determine redirect URL. Please configure SITE_URL environment variable.');
    }
    
    const redirectTo = `${origin}/auth/callback`;
    
    console.log('Inviting user:', { email, role, redirectTo });
    
    // Invite user via Supabase Admin API
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          invited_by: user.id,
          invited_at: new Date().toISOString(),
          first_name: firstName,
          last_name: lastName,
        },
        redirectTo: redirectTo
      }
    );

    if (inviteError) {
      console.error('Error inviting user:', inviteError);
      throw inviteError;
    }
    
    console.log('User invited successfully:', { userId: inviteData?.user?.id, email });

    // Add role for the new user
    if (inviteData?.user?.id) {
      console.log('Creating user role and profile for:', inviteData.user.id);
      
      const { error: roleInsertError } = await supabaseAdmin
        .from('user_roles')
        .insert({
          user_id: inviteData.user.id,
          role: role || 'user',
          created_by: user.id
        });

      if (roleInsertError) {
        console.error('Error adding role:', roleInsertError);
        throw new Error(`Failed to add role: ${roleInsertError.message}`);
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
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }
      
      console.log('User role and profile created successfully');
    } else {
      throw new Error('User invitation succeeded but no user ID was returned');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Invitation sent successfully',
        user: inviteData.user 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in invite-user function:', error);
    
    // Provide helpful error messages based on error type
    let errorMessage = error.message;
    if (error.message.includes('email')) {
      errorMessage += ' Kontrollera att e-postadressen är korrekt och att e-postkonfigurationen i Supabase är inställd.';
    } else if (error.message.includes('redirect')) {
      errorMessage += ' Kontakta supporten om problemet kvarstår.';
    }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
