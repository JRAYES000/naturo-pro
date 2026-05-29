import { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { ExternalLink, CheckCircle2, KeyRound, Mail, Globe } from "lucide-react";

/**
 * Pop-up tutoriel Resend pour les praticiennes peu à l'aise avec l'informatique.
 * Affiche un guide pas-à-pas pour créer un compte Resend, vérifier le domaine,
 * et récupérer la clé API.
 */
export function ResendTutorialDialog({ trigger }: { trigger: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl" style={{ color: "#1b4332" }}>
            Comment créer votre compte Resend (5 minutes)
          </DialogTitle>
          <DialogDescription>
            Resend est le service qui envoie automatiquement les emails de rappels à vos clientes.
            C'est <strong>100&nbsp;% gratuit</strong> jusqu'à 3&nbsp;000 emails par mois (largement
            suffisant pour la plupart des cabinets).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2 text-sm">
          {/* Étape 1 */}
          <Step
            num={1}
            icon={<Globe className="h-5 w-5" />}
            title="Créez votre compte Resend"
          >
            <p>
              Rendez-vous sur{" "}
              <a
                href="https://resend.com/signup"
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline inline-flex items-center gap-1"
                style={{ color: "#1b4332" }}
              >
                resend.com/signup <ExternalLink className="h-3 w-3" />
              </a>{" "}
              et inscrivez-vous avec votre email professionnel. Vous pouvez aussi
              vous connecter avec Google ou GitHub si c'est plus simple.
            </p>
            <p className="text-xs text-muted-foreground">
              Pas de carte bancaire demandée. Aucun frais caché.
            </p>
          </Step>

          {/* Étape 2 */}
          <Step
            num={2}
            icon={<Mail className="h-5 w-5" />}
            title="Ajoutez votre domaine d'envoi"
          >
            <p>
              Dans le menu de gauche, cliquez sur <strong>Domains</strong>, puis sur le bouton{" "}
              <strong>Add Domain</strong> en haut à droite. Saisissez votre nom de domaine
              (ex: <code className="bg-secondary px-1 rounded text-xs">moncabinet.fr</code>).
            </p>
            <p className="text-xs text-muted-foreground">
              Si vous n'avez pas encore de domaine, vous pouvez en acheter un sur OVH, Gandi
              ou Hostinger (environ 10&nbsp;€/an). Sans domaine, les emails partiront avec
              une adresse générique peu professionnelle.
            </p>
          </Step>

          {/* Étape 3 */}
          <Step
            num={3}
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Vérifiez votre domaine (DNS)"
          >
            <p>
              Resend va vous afficher 3 lignes à copier dans la zone DNS de votre domaine
              (chez OVH, Gandi, Hostinger…). Ce sont des enregistrements de type{" "}
              <strong>TXT</strong>, <strong>MX</strong> et <strong>CNAME</strong>.
            </p>
            <p>
              Allez dans l'espace client de votre hébergeur, trouvez la rubrique
              "Zone DNS" ou "Gérer les DNS", et ajoutez les 3 lignes telles quelles.
              Sauvegardez, puis revenez sur Resend et cliquez sur <strong>Verify DNS Records</strong>.
            </p>
            <p className="text-xs text-muted-foreground">
              La vérification peut prendre de quelques minutes à quelques heures.
              Si vous bloquez, contactez le support de votre hébergeur — c'est une
              demande très classique qu'ils gèrent en 5 minutes.
            </p>
          </Step>

          {/* Étape 4 */}
          <Step
            num={4}
            icon={<KeyRound className="h-5 w-5" />}
            title="Créez votre clé API"
          >
            <p>
              Une fois le domaine vérifié (statut vert "Verified"), allez dans le menu{" "}
              <strong>API Keys</strong> à gauche, puis cliquez sur{" "}
              <strong>Create API Key</strong>.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Name</strong> : mettez ce que vous voulez, par exemple{" "}
                <em>"Naturo Pro"</em>.
              </li>
              <li>
                <strong>Permission</strong> : choisissez{" "}
                <strong>Sending access</strong> (envoi seulement, plus sûr).
              </li>
              <li>
                <strong>Domain</strong> : laissez sur "All domains" ou choisissez le
                domaine que vous venez de vérifier.
              </li>
            </ul>
            <p>
              Cliquez sur <strong>Add</strong>. Resend affiche une clé qui commence par{" "}
              <code className="bg-secondary px-1 rounded text-xs">re_...</code>.
            </p>
            <div
              className="rounded-md p-3 text-xs"
              style={{ background: "#fef3c7", border: "1px solid #f59e0b" }}
            >
              ⚠️ <strong>Important</strong> : copiez cette clé immédiatement et collez-la
              dans Naturo Pro. Resend ne vous la remontrera jamais. Si vous la perdez,
              il faudra en créer une nouvelle.
            </div>
          </Step>

          {/* Étape 5 */}
          <Step
            num={5}
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Collez la clé dans Naturo Pro"
          >
            <p>
              Revenez sur cette page (Paramètres &gt; Rappels email) et collez la clé dans le
              champ <strong>Clé API Resend</strong>. Renseignez aussi votre email
              expéditeur (ex&nbsp;:{" "}
              <code className="bg-secondary px-1 rounded text-xs">noreply@moncabinet.fr</code>),
              activez les toggles, et cliquez sur <strong>Enregistrer</strong>. C'est tout&nbsp;!
            </p>
            <p className="text-xs text-muted-foreground">
              À partir de maintenant, vos clientes recevront automatiquement leur rappel
              la veille de chaque RDV, et vous recevrez votre récap quotidien chaque matin.
            </p>
          </Step>

          {/* Bloc aide */}
          <div
            className="rounded-md p-4 text-sm"
            style={{ background: "#f0fdf4", border: "1px solid #1b4332" }}
          >
            <p className="font-semibold mb-1" style={{ color: "#1b4332" }}>
              Besoin d'aide ?
            </p>
            <p className="text-xs text-muted-foreground">
              Si vous bloquez à une étape, le support Resend est très réactif (en anglais)
              à <strong>support@resend.com</strong>. Vous pouvez aussi demander à votre
              hébergeur web de configurer les DNS pour vous — c'est une opération de
              quelques minutes pour eux.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Step({
  num,
  icon,
  title,
  children,
}: {
  num: number;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-white"
        style={{ background: "#1b4332" }}
      >
        {num}
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span style={{ color: "#1b4332" }}>{icon}</span>
          <h3 className="font-semibold" style={{ color: "#1b4332" }}>
            {title}
          </h3>
        </div>
        <div className="space-y-2 text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
