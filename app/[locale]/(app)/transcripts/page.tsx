import { getTranslations } from "next-intl/server";
import { MessageSquareText } from "lucide-react";
import { TranscriptsPlaceholder } from "@/components/stock/TranscriptsPlaceholder";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function TranscriptsPage() {
  const t = await getTranslations("transcripts");

  return (
    <div className="space-y-8">
      <PageHeader
        icon={<MessageSquareText className="h-6 w-6" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <div className="max-w-3xl">
        <TranscriptsPlaceholder />
      </div>
    </div>
  );
}
