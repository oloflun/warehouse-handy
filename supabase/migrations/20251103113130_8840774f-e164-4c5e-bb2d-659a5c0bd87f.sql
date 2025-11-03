-- Skapa profiles-tabell för användarinformation
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies - alla autentiserade kan se profiler
CREATE POLICY "Anyone can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Endast admins kan skapa profiler (via edge function)
CREATE POLICY "Only admins can insert profiles"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Användare kan uppdatera sin egen profil
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Trigger för att uppdatera updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Lägg till profil för befintlig admin-användare (Anton Lundin)
INSERT INTO public.profiles (id, first_name, last_name)
SELECT id, 'Anton', 'Lundin'
FROM auth.users
WHERE email = 'oloflundin@icloud.com'
ON CONFLICT (id) DO UPDATE 
SET first_name = 'Anton', last_name = 'Lundin';