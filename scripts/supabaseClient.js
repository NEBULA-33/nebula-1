// scripts/supabaseClient.js

const SUPABASE_URL = 'https://zrxtsrpduhopierlpiop.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyeHRzcnBkdWhvcGllcmxwaW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MDc5MjAsImV4cCI6MjA3MTA4MzkyMH0.TEPzOurzl7VeDn15zZIhL9u8Hlf9d7E_yoOKx3hi2XQ';

// DÜZELTME: Değişken ismini (client) farklılaştırarak hatayı çözüyoruz.
// Bu kod, index.html'den gelen global 'supabase' nesnesini kullanır.
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Diğer dosyaların 'import { supabase }' satırının çalışmaya devam etmesi için,
// oluşturduğumuz 'client' nesnesini 'supabase' adıyla export ediyoruz.
export { client as supabase };