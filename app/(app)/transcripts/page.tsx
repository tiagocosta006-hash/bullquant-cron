import { getTranslations } from "next-intl/server";
import { TranscriptsPlaceholder } from "@/components/stock/TranscriptsPlaceholder";

export default async function TranscriptsPage() {
  const t = await getTranslations("transcripts");

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("subtitle")}</p>
      </div>

      <div className="max-w-3xl">
        <TranscriptsPlaceholder />
      </div>
    </div>
  );
}
