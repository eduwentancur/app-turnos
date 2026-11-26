# Conectar el número de WhatsApp (entorno de desarrollo)

Guía para que el bot responda en WhatsApp de verdad, usando el **número de prueba** que da Meta
y tu PC como servidor (a través de un túnel HTTPS).

> Nunca subas tokens ni claves a GitHub ni los pegues en chats. Van solo en `apps/api/.env`, que está en `.gitignore`.

## 1. Datos de Meta

En **developers.facebook.com → tu app → WhatsApp → Configuración de la API** (*API Setup*):

1. En **"Para"** (*To*), agregá tu celular y confirmá el código que te llega. El número de prueba solo
   puede escribirle a números verificados así (hasta 5).
2. Copiá el **Identificador del número de teléfono** (*Phone number ID*).
3. Tocá **Generar token de acceso**. Es temporal: **vence a las 24 h** (después hay que generar otro;
   el token permanente se configura más adelante con un usuario del sistema).

En **Configuración de la app → Básica**, copiá la **Clave secreta de la app** (*App secret*).

## 2. Variables de entorno

Agregá al final de `apps/api/.env` (los valores entre `<...>` son los tuyos):

```
WHATSAPP_VERIFY_TOKEN=<inventá un texto largo, ej. turnito-verify-8f3k2j>
WHATSAPP_APP_SECRET=<clave secreta de la app>
WHATSAPP_ACCESS_TOKEN=<token de acceso>
WHATSAPP_PHONE_NUMBER_ID=<identificador del número>
WHATSAPP_BARBERSHOP_SLUG=barberia-bf
```

Reiniciá la API (`Ctrl + C` y `pnpm dev`).

## 3. URL pública con un túnel

Meta necesita una URL HTTPS pública para avisar de los mensajes. En desarrollo usamos un túnel gratuito
de Cloudflare que expone tu `localhost:3001`:

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3001
```

Va a mostrar una URL tipo `https://palabras-al-azar.trycloudflare.com`. Dejá esa ventana abierta.
La URL cambia cada vez que lo ejecutás (en ese caso, repetí el paso 4).

## 4. Webhook en Meta

En **tu app → WhatsApp → Configuración** (*Configuration*) → **Webhook → Editar**:

- **URL de devolución de llamada**: `https://<tu-url>.trycloudflare.com/api/whatsapp/webhook`
- **Token de verificación**: el mismo valor de `WHATSAPP_VERIFY_TOKEN`

Tocá **Verificar y guardar**. Después, en **Campos del webhook**, suscribite a **`messages`**.

## 5. Probar

Desde tu celular, mandale **"hola"** al número de prueba (aparece en *Configuración de la API → De*).
El bot responde con el menú. Los turnos que reserves aparecen en el panel con 📲.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| Meta dice que no pudo verificar la URL | La API o el túnel no están corriendo, o el token de verificación no coincide |
| El bot no responde y en la consola de la API aparece `Cloud API respondió 401` | Venció el token temporal: generá otro y actualizá `.env` |
| En la consola aparece `Webhook rechazado: firma inválida` | `WHATSAPP_APP_SECRET` no es la clave secreta de esta app |
| `Webhook para un número no configurado` | `WHATSAPP_PHONE_NUMBER_ID` no coincide con el número de prueba |
| `(#131030) Recipient phone number not in allowed list` | Tu celular no está agregado en "Para" (paso 1.1) |
