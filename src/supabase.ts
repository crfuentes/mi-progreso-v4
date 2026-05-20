import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://auennuzkgpfexxpxkvrh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1ZW5udXprZ3BmZXh4cHhrdnJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjIxNDYsImV4cCI6MjA5MzYzODE0Nn0.g9swStHK_O610WMNFJDFPOLdoToxo14C-7jWpQcr2GM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);