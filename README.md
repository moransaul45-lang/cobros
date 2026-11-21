# Punto de Pedido

Aplicación React + Vite para clientes, catálogo, pedidos, entregas, cobros y reportes diarios. La autenticación y los datos usan Supabase; cada usuario solo puede consultar y modificar sus propios registros mediante Row Level Security (RLS).

## Requisitos

- Node.js 20.19+ o 22.12+
- Un proyecto Supabase

## 1. Crear la base de datos en Supabase

1. Crea una cuenta e inicia sesión en [Supabase](https://supabase.com/).
2. Presiona **New project**, escribe un nombre y una contraseña para la base de datos, y elige una región cercana.
3. Espera a que termine de crearse el proyecto. En **SQL Editor**, crea una consulta nueva, pega todo el contenido de `supabase/schema.sql` y presiona **Run** una sola vez. Esto crea tablas, índices, funciones y políticas de seguridad.
4. En **Project Settings → API**, copia la **Project URL** y la clave pública **Publishable key** (en proyectos antiguos puede aparecer como `anon`).
5. No pongas la contraseña de la base de datos ni la clave `service_role` en el frontend, `.env.local` o GitHub.
6. En **Authentication → URL Configuration**, agrega la dirección de tu aplicación a **Site URL** y **Redirect URLs**. Para GitHub Pages usa `https://TU_USUARIO.github.io/TU_REPOSITORIO/`.

El esquema contiene tablas de clientes, productos, pedidos, renglones y pagos; RLS y políticas por usuario; y funciones transaccionales que calculan el precio desde el catálogo, guardan el precio histórico y evitan abonos mayores al saldo.

## 2. Conectar y probar en tu computadora

```powershell
Copy-Item .env.example .env.local
```

Abre `.env.local` y reemplaza los valores de ejemplo por la **Project URL** y la **Publishable key**:

```env
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
```

En la carpeta del proyecto instala dependencias e inicia la web:

```powershell
npm.cmd install
npm.cmd run dev
```

Abre la dirección local que muestra Vite. Crea una cuenta con tu correo desde la pantalla inicial; si Supabase pide confirmar el correo, abre el mensaje antes de iniciar sesión. `.env.local` está excluido de Git.

## 3. Subir el código a GitHub

Si no tienes Git instalado, puedes instalar **GitHub Desktop** e iniciar sesión con tu cuenta de GitHub:

1. En GitHub Desktop elige **File → Add local repository** y selecciona la carpeta de este proyecto.
2. Si te indica que la carpeta aún no es un repositorio, elige la opción para crear el repositorio en esa carpeta.
3. Revisa que `.env.local` no aparezca entre los archivos por publicar. `.gitignore` lo excluye automáticamente.
4. Presiona **Publish repository** y confirma el nombre y si el repositorio será público o privado.

## 4. Publicar la web con GitHub Pages

1. `.env.example` contiene la URL del proyecto y la clave pública `publishable` o `anon`; son valores de cliente que se incluyen en el JavaScript publicado. No pongas la contraseña de la base de datos ni la clave `service_role` ahí.
2. En GitHub, abre **Settings → Pages** y selecciona **GitHub Actions** como fuente en **Build and deployment**. Este paso se hace una sola vez; el token del workflow no puede crear el sitio por sí solo.
3. El workflow `.github/workflows/deploy.yml` copia la configuración pública durante la compilación y publica la app en cada push a `main`.
4. Si ya hubo un intento fallido antes de activar Pages, vuelve a ejecutarlo en **Actions → Deploy to GitHub Pages → Re-run jobs** o haz un nuevo push.
5. Cuando termine la acción, copia la URL que aparece en **Settings → Pages** y agrégala a **Supabase → Authentication → URL Configuration → Site URL** y **Redirect URLs**.

## Lógica de datos

- El registro de cliente usa la fecha del servidor Supabase.
- Cada pedido conserva nombre y precio de los productos al momento de guardarlo.
- `create_order` calcula y guarda el importe desde el servidor, dentro de una transacción.
- `record_payment` serializa los cobros por cliente y no acepta pagos superiores al saldo.
- El informe diario suma cajas y ventas según la fecha local capturada al crear el pedido.

No hay una cuenta de demostración ni respaldo local: al faltar variables de Supabase la pantalla de inicio muestra el paso que falta, y los datos reales solo se guardan en la base de datos configurada.
