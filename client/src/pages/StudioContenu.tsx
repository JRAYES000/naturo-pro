import { Sparkles } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { NaturobotTabs } from "@/components/assistant/NaturobotTabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function StudioContenu() {
  return (
    <AppLayout>
      <PageHeader title="Naturobot" subtitle="Crée des contenus prêts à publier pour attirer des clientes." icon={Sparkles} />
      <NaturobotTabs />
      <Tabs defaultValue="creer">
        <TabsList className="rounded-[12px]">
          <TabsTrigger value="creer" data-testid="tab-studio-creer">Créer</TabsTrigger>
          <TabsTrigger value="bibliotheque" data-testid="tab-studio-bibliotheque">Mes contenus</TabsTrigger>
        </TabsList>
        <TabsContent value="creer">
          <div className="card-naturo">Bientôt : le générateur de contenu.</div>
        </TabsContent>
        <TabsContent value="bibliotheque">
          <div className="card-naturo">Bientôt : ta bibliothèque de contenus.</div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
