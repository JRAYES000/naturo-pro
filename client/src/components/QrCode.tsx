/**
 * QR codes générés dans le navigateur (encodeur maison, shared/qrcode.ts) :
 *   - QrCodeImage : affichage (page de réservation, enrôlement 2FA) ;
 *   - QrCodeCard  : carte « QR code de votre page » avec téléchargement PNG / SVG,
 *     pour une carte de visite, une affiche en salle d'attente ou un flyer.
 */
import { useMemo } from "react";
import { Download, QrCode as QrIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { encodeQr, qrToSvg, type QrCode, type QrEcc } from "@shared/qrcode";

export function QrCodeImage({ value, size = 192, ecc = "M", className = "", alt }: {
  value: string; size?: number; ecc?: QrEcc; className?: string; alt: string;
}) {
  const src = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrToSvg(encodeQr(value, { ecc })))}`, [value, ecc]);
  return <img src={src} width={size} height={size} alt={alt} className={`rounded-md border bg-white ${className}`} style={{ imageRendering: "pixelated" }} />;
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** PNG net pour l'impression : ~1 200 px de côté, marge de 4 modules. */
function pngBlob(qr: QrCode): Promise<Blob | null> {
  const border = 4;
  const dim = qr.size + border * 2;
  const scale = Math.ceil(1200 / dim);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = dim * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function QrCodeCard({ url, fileName }: { url: string; fileName: string }) {
  const qr = useMemo(() => (url ? encodeQr(url, { ecc: "M" }) : null), [url]);
  if (!qr) return null;
  return (
    <div className="card-naturo mb-5" data-testid="card-public-qr">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
        <QrCodeImage value={url} size={152} alt="QR code de votre page de réservation" />
        <div className="space-y-2">
          <p className="font-bold flex items-center gap-2"><QrIcon className="h-4 w-4 text-primary" /> QR code de votre page</p>
          <p className="text-sm text-muted-foreground">
            Imprimez-le sur vos cartes de visite, flyers ou en salle d'attente : vos clientes le scannent avec leur
            téléphone et arrivent directement sur votre page de réservation.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-md font-bold" data-testid="button-qr-png"
              onClick={async () => { const b = await pngBlob(qr); if (b) download(`${fileName}.png`, b); }}>
              <Download className="h-4 w-4 mr-1" /> PNG
            </Button>
            <Button variant="outline" size="sm" className="rounded-md font-bold" data-testid="button-qr-svg"
              onClick={() => download(`${fileName}.svg`, new Blob([qrToSvg(qr)], { type: "image/svg+xml" }))}>
              <Download className="h-4 w-4 mr-1" /> SVG (imprimeur)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
