import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Execute the SQL to add DELETE policies
        const sql = `
      -- Add DELETE policies for delivery notes (Super Admin only)
      
      DROP POLICY IF EXISTS "Super admins can delete delivery notes" ON public.delivery_notes;
      CREATE POLICY "Super admins can delete delivery notes"
        ON public.delivery_notes FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_super_admin = true
          )
        );

      DROP POLICY IF EXISTS "Super admins can delete delivery note items" ON public.delivery_note_items;
      CREATE POLICY "Super admins can delete delivery note items"
        ON public.delivery_note_items FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_super_admin = true
          )
        );

      DROP POLICY IF EXISTS "Super admins can delete orders" ON public.orders;
      CREATE POLICY "Super admins can delete orders"
        ON public.orders FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_super_admin = true
          )
        );

      DROP POLICY IF EXISTS "Super admins can delete order lines" ON public.order_lines;
      CREATE POLICY "Super admins can delete order lines"
        ON public.order_lines FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_super_admin = true
          )
        );

      DROP POLICY IF EXISTS "Super admins can delete products" ON public.products;
      CREATE POLICY "Super admins can delete products"
        ON public.products FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_super_admin = true
          )
        );

      DROP POLICY IF EXISTS "Super admins can delete inventory" ON public.inventory;
      CREATE POLICY "Super admins can delete inventory"
        ON public.inventory FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.is_super_admin = true
          )
        );
    `;

        const { data, error } = await supabaseClient.rpc('exec_sql', { sql_query: sql });

        if (error) throw error;

        return new Response(
            JSON.stringify({ success: true, message: 'DELETE policies added successfully' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
