// Generacion de tickets ESC/POS e impresion RAW por winspool.dll (Windows).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { PAPER_WIDTHS } = require('./config');

// ---------------------------------------------------------------------------
// Comandos ESC/POS
// ---------------------------------------------------------------------------
const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  INIT: [ESC, 0x40],
  CODEPAGE_PC850: [ESC, 0x74, 0x02], // ESC t 2 -> PC850 (Multilingual, acentos ES)
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  SIZE_NORMAL: [GS, 0x21, 0x00],
  SIZE_DOUBLE: [GS, 0x21, 0x11], // doble ancho + doble alto
  SIZE_DOUBLE_H: [GS, 0x21, 0x01], // doble alto
  FEED_AND_CUT: [GS, 0x56, 0x42, 0x00], // corte parcial con avance
  // Cajon de dinero (pin 2, pulso). Comando EXACTO indicado en el spec.
  OPEN_DRAWER: [0x1b, 0x70, 0x00, 0x19, 0xfa]
};

// Mapa de caracteres a PC850 (para acentos y simbolos del espanol).
const CP850 = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9,
  'ñ': 0xa4, 'Ñ': 0xa5, 'ü': 0x81, 'Ü': 0x9a,
  '¿': 0xa8, '¡': 0xad, 'º': 0xa7, 'ª': 0xa6, '°': 0xf8, '·': 0xfa
};

// Convierte una cadena a bytes usando PC850; caracteres desconocidos -> '?'.
function encodeText(str) {
  const out = [];
  for (const ch of String(str)) {
    if (CP850[ch] !== undefined) out.push(CP850[ch]);
    else {
      const code = ch.charCodeAt(0);
      out.push(code >= 0x20 && code <= 0x7e ? code : 0x3f); // ASCII imprimible o '?'
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// TicketBuilder: acumula bytes ESC/POS
// ---------------------------------------------------------------------------
class TicketBuilder {
  constructor(paperSize = 80) {
    this.width = PAPER_WIDTHS[paperSize] || PAPER_WIDTHS[80];
    this.bytes = [];
    this.push(CMD.INIT);
    this.push(CMD.CODEPAGE_PC850);
  }

  push(arr) { for (const b of arr) this.bytes.push(b); return this; }

  raw(bytes) { return this.push(bytes); }

  text(str) { return this.push(encodeText(str)); }

  newline(n = 1) { for (let i = 0; i < n; i++) this.bytes.push(0x0a); return this; }

  line(str = '') { return this.text(str).newline(); }

  alignLeft() { return this.push(CMD.ALIGN_LEFT); }
  alignCenter() { return this.push(CMD.ALIGN_CENTER); }
  alignRight() { return this.push(CMD.ALIGN_RIGHT); }
  boldOn() { return this.push(CMD.BOLD_ON); }
  boldOff() { return this.push(CMD.BOLD_OFF); }
  sizeNormal() { return this.push(CMD.SIZE_NORMAL); }
  sizeDouble() { return this.push(CMD.SIZE_DOUBLE); }
  sizeDoubleH() { return this.push(CMD.SIZE_DOUBLE_H); }

  // Linea separadora de guiones al ancho del papel.
  separator(ch = '-') { return this.line(ch.repeat(this.width)); }

  // Dos columnas: texto a la izquierda, texto a la derecha, rellenado con espacios.
  twoCol(left, right) {
    left = String(left);
    right = String(right);
    const space = this.width - left.length - right.length;
    if (space < 1) {
      const cut = Math.max(0, this.width - right.length - 1);
      left = left.slice(0, cut);
      return this.line(left + ' ' + right);
    }
    return this.line(left + ' '.repeat(space) + right);
  }

  openDrawer() { return this.push(CMD.OPEN_DRAWER); }

  cut() { return this.newline(4).push(CMD.FEED_AND_CUT); }

  build() { return Buffer.from(this.bytes); }
}

// ---------------------------------------------------------------------------
// Formato de dinero
// ---------------------------------------------------------------------------
function money(n) {
  const val = Number(n || 0);
  return '$' + val.toFixed(2);
}

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDateTime(date) {
  const d = date || new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Construccion del ticket de venta (receipt)
// ---------------------------------------------------------------------------
function buildReceipt(ticket = {}, paperSize = 80) {
  const t = new TicketBuilder(paperSize);
  const items = Array.isArray(ticket.items) ? ticket.items : [];

  // Encabezado
  t.alignCenter().boldOn().sizeDouble();
  t.line(ticket.businessName || 'IMPERIO');
  t.sizeNormal().boldOff();
  if (ticket.branchName) t.line(ticket.branchName);
  t.newline();

  if (ticket.ticketNumber) {
    t.boldOn().line(`Ticket #${ticket.ticketNumber}`).boldOff();
  }
  t.line(formatDateTime(ticket.date ? new Date(ticket.date) : null));
  t.alignLeft().separator();

  // Cliente / barbero
  if (ticket.client) t.line(`Cliente: ${ticket.client}`);
  if (ticket.barber) t.line(`Atendio: ${ticket.barber}`);
  if (ticket.client || ticket.barber) t.separator();

  // Items
  let computedSubtotal = 0;
  for (const it of items) {
    const qty = Number(it.qty || 1);
    const unit = Number(it.price || 0);
    const lineTotal = qty * unit;
    computedSubtotal += lineTotal;
    t.line(`${qty}x ${it.name || ''}`);
    t.twoCol(`   @ ${money(unit)}`, money(lineTotal));
  }
  t.separator();

  // Totales
  const subtotal = ticket.subtotal != null ? Number(ticket.subtotal) : computedSubtotal;
  const discount = Number(ticket.discount || 0);
  const total = ticket.total != null ? Number(ticket.total) : subtotal - discount;

  t.twoCol('Subtotal:', money(subtotal));
  if (discount > 0) t.twoCol('Descuento:', '-' + money(discount));
  t.boldOn().sizeDoubleH().twoCol('TOTAL:', money(total)).sizeNormal().boldOff();
  t.separator();

  // Pago
  if (ticket.paymentMethod) t.line(`Pago: ${ticket.paymentMethod}`);
  if (ticket.cashReceived != null) {
    const received = Number(ticket.cashReceived);
    t.twoCol('Recibido:', money(received));
    const change = received - total;
    if (change >= 0) t.twoCol('Cambio:', money(change));
  }
  t.separator();

  // Pie
  t.alignCenter();
  t.line(ticket.footer || 'Gracias por tu preferencia!');
  if (ticket.businessName) t.line(ticket.businessName);
  t.cut();

  return t.build();
}

// Ticket de prueba.
function buildTestTicket(paperSize = 80) {
  return buildReceipt({
    businessName: 'IMPERIO BARBERSHOP',
    branchName: 'Ticket de prueba',
    ticketNumber: 'TEST',
    client: 'Cliente Demo',
    barber: 'Barbero Demo',
    items: [
      { qty: 1, name: 'Corte clasico', price: 150 },
      { qty: 2, name: 'Afeitada', price: 80 }
    ],
    subtotal: 310,
    discount: 10,
    total: 300,
    paymentMethod: 'Efectivo',
    cashReceived: 350
  }, paperSize);
}

// Solo el comando de apertura de cajon (con init previo).
function buildDrawerPulse() {
  return Buffer.from([...CMD.INIT, ...CMD.OPEN_DRAWER]);
}

// ---------------------------------------------------------------------------
// Impresion RAW por winspool.dll (via PowerShell + P/Invoke)
// ---------------------------------------------------------------------------
const RAWPRINT_PS1 = `param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$FilePath
)
$ErrorActionPreference = 'Stop'
$code = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
  public static void SendBytes(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
      throw new Exception("OpenPrinter fallo (codigo " + Marshal.GetLastWin32Error() + "). Impresora: " + printerName);
    try {
      DOCINFOW di = new DOCINFOW();
      di.pDocName = "Imperio Print";
      di.pDataType = "RAW";
      if (!StartDocPrinter(hPrinter, 1, di))
        throw new Exception("StartDocPrinter fallo (codigo " + Marshal.GetLastWin32Error() + ").");
      try {
        if (!StartPagePrinter(hPrinter))
          throw new Exception("StartPagePrinter fallo (codigo " + Marshal.GetLastWin32Error() + ").");
        IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pBytes, bytes.Length);
        try {
          int written;
          if (!WritePrinter(hPrinter, pBytes, bytes.Length, out written))
            throw new Exception("WritePrinter fallo (codigo " + Marshal.GetLastWin32Error() + ").");
        } finally {
          Marshal.FreeCoTaskMem(pBytes);
        }
        EndPagePrinter(hPrinter);
      } finally {
        EndDocPrinter(hPrinter);
      }
    } finally {
      ClosePrinter(hPrinter);
    }
  }
}
'@
Add-Type -TypeDefinition $code -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
[RawPrinter]::SendBytes($PrinterName, $bytes)
`;

let ps1Path = null;
function ensurePs1() {
  if (ps1Path && fs.existsSync(ps1Path)) return ps1Path;
  ps1Path = path.join(os.tmpdir(), 'imperio-rawprint.ps1');
  fs.writeFileSync(ps1Path, RAWPRINT_PS1, 'utf8');
  return ps1Path;
}

// Envia un Buffer de bytes RAW a la impresora indicada.
function printRaw(printerName, buffer) {
  return new Promise((resolve, reject) => {
    if (!printerName) return reject(new Error('No hay impresora asignada.'));
    const script = ensurePs1();
    const tmpBin = path.join(
      os.tmpdir(),
      `imperio-job-${process.pid}-${Date.now()}.bin`
    );
    try {
      fs.writeFileSync(tmpBin, buffer);
    } catch (e) {
      return reject(new Error('No se pudo escribir el trabajo de impresion: ' + e.message));
    }
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script,
        '-PrinterName', printerName, '-FilePath', tmpBin],
      { windowsHide: true, timeout: 20000 },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(tmpBin); } catch (_) { /* ignore */ }
        if (err) return reject(new Error((stderr || err.message || '').trim() || 'Fallo la impresion.'));
        resolve(true);
      }
    );
  });
}

// Lista las impresoras instaladas en el sistema (Windows).
function listSystemPrinters() {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
        'Get-CimInstance -ClassName Win32_Printer | Select-Object -ExpandProperty Name'],
      { windowsHide: true, timeout: 15000 },
      (err, stdout) => {
        if (err) return reject(new Error('No se pudieron listar las impresoras: ' + err.message));
        const printers = String(stdout)
          .split(/\r?\n/)
          .map(s => s.trim())
          .filter(Boolean);
        resolve(printers);
      }
    );
  });
}

module.exports = {
  TicketBuilder,
  buildReceipt,
  buildTestTicket,
  buildDrawerPulse,
  printRaw,
  listSystemPrinters,
  PAPER_WIDTHS
};
