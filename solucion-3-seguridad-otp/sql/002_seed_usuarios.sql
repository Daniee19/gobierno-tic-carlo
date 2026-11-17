-- Usuarios ficticios de la demo.
insert into usuarios (email, nombre, rol) values
  ('admin@carlo.demo',   'Admin Demo',  'admin'),
  ('asesor1@carlo.demo', 'Asesor Uno',  'asesor'),
  ('asesor2@carlo.demo', 'Asesor Dos',  'asesor')
on conflict (email) do nothing;
