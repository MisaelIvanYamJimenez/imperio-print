# Imperio Print

Aplicacion de escritorio (Electron) que actua como **puente** entre el panel web de
Imperio y las **impresoras termicas + cajon de dinero** del local.

La web se conecta por WebSocket a `ws://localhost:9633` y envia comandos JSON.
La app convierte los datos a **ESC/POS** y los manda RAW a la impresora via `winspool.dll`.

---

## Desarrollo

```bash
npm install          # instala dependencias
npm run make-icon    # genera assets/icon.ico desde assets/icon.png
npm start            # inicia en modo dev (bandera IMPERIO_DEV)
```

En modo dev la ventana de configuracion se muestra al arrancar.
Empaquetada, la app **inicia oculta en la bandeja del sistema**.

## Build (instalador Windows)

```bash
npm run build        # genera dist/ con el instalador NSIS
```

Requiere `assets/icon.ico` (min 256x256). El repo de GitHub para releases debe ser
**publico** (electron-updater no accede a repos privados).

### Publicar un Release (auto-update)

Cada GitHub Release debe incluir **3 archivos**, con **guiones** en vez de espacios:

- `Imperio-Print-Setup-x.y.z.exe`
- `Imperio-Print-Setup-x.y.z.exe.blockmap`
- `latest.yml`  ← **obligatorio**, sin el no se detectan versiones nuevas.

---

## Protocolo WebSocket

- URL: `ws://localhost:9633`
- Solo se aceptan conexiones desde origenes permitidos (`src/config.js` + localhost en dev).
- Todo mensaje (excepto `ping`) debe incluir `token` == token de la sucursal.
- Cada mensaje puede llevar un `id` que se devuelve en la respuesta (para correlacionar).

### Formato general

Peticion:
```json
{ "action": "print", "token": "TOKEN_SUCURSAL", "id": "abc123", ...datos }
```
Respuesta OK:
```json
{ "id": "abc123", "ok": true, "action": "print", "printed": true }
```
Respuesta error:
```json
{ "id": "abc123", "ok": false, "action": "print", "error": "descripcion" }
```

### Acciones

| Accion            | Token | Parametros                                   | Respuesta |
|-------------------|:-----:|----------------------------------------------|-----------|
| `ping`            |  No   | —                                            | `{ status, version, printers }` |
| `list_printers`   |  Si   | —                                            | `{ system: [...], assigned }` |
| `assign_printer`  |  Si   | `printerType`, `printerName`, `paperSize`    | `{ assigned }` |
| `unassign_printer`|  Si   | `printerType`                                | `{ assigned }` |
| `print`           |  Si   | `printerType`, `ticket`, `openDrawer`        | `{ printed: true }` |
| `open_drawer`     |  Si   | `printerType`                                | `{ drawer: "opened" }` |
| `test_print`      |  Si   | `printerType`                                | `{ printed: true }` |
| `get_config`      |  Si   | —                                            | `{ printers, version }` |

- `printerType`: siempre `"cashier"` (en barberia solo hay caja). Si se omite, se asume `cashier`.
- `paperSize`: `80` (48 cols) o `58` (32 cols).
- `openDrawer`: `true` para abrir el cajon al imprimir.

### Ejemplo: imprimir ticket + abrir cajon

```json
{
  "action": "print",
  "token": "TOKEN_SUCURSAL",
  "printerType": "cashier",
  "openDrawer": true,
  "ticket": {
    "type": "receipt",
    "businessName": "IMPERIO BARBERSHOP",
    "branchName": "Sucursal Centro",
    "ticketNumber": "047",
    "client": "Carlos Lopez",
    "barber": "Miguel",
    "items": [
      { "qty": 1, "name": "Corte clasico", "price": 150 },
      { "qty": 1, "name": "Afeitada", "price": 80 }
    ],
    "subtotal": 230,
    "discount": 23,
    "total": 207,
    "paymentMethod": "Efectivo",
    "cashReceived": 250
  }
}
```

### Ejemplo de cliente web (JS)

```js
const ws = new WebSocket('ws://localhost:9633');
ws.onopen = () => ws.send(JSON.stringify({ action: 'ping' }));
ws.onmessage = (e) => console.log(JSON.parse(e.data));

function imprimir(ticket) {
  ws.send(JSON.stringify({
    action: 'print',
    token: TOKEN_SUCURSAL,
    printerType: 'cashier',
    openDrawer: true,
    ticket
  }));
}
```

---

## Configuracion (UI de escritorio)

1. Pega el **token de la sucursal** (debe coincidir con el del panel).
2. Selecciona la **impresora** y el **ancho de papel** (80/58 mm) y pulsa *Asignar*.
3. Usa *Ticket de prueba* y *Abrir cajon* para validar el hardware.

La configuracion se guarda con `electron-store`:
`{ cashier: { name: "POS-80", paperSize: 80 } }`.

## Estructura

```
main.js                   Proceso principal (ventana, tray, IPC, updater, auto-launch)
preload.js                Bridge seguro UI <-> main (contextBridge)
ui/index.html + renderer.js   Interfaz de configuracion
src/config.js             Puerto y origenes permitidos
src/security.js           Validacion de origen y token
src/store.js              Persistencia (electron-store)
src/printer.js            TicketBuilder ESC/POS + impresion RAW (winspool.dll)
src/websocket-server.js   Servidor WebSocket (acciones)
src/tray.js               Icono de bandeja
assets/icon.png|.ico      Iconos
scripts/make-icon.js      Genera icon.ico desde icon.png
```

## Cajon de dinero

Se abre con el comando ESC/POS `[0x1b, 0x70, 0x00, 0x19, 0xfa]`, enviado a la impresora
de caja (el cajon se conecta al puerto RJ11 de la impresora).
