import ToolPage from "../../components/ToolPage";
import RebuttalGenerator from "./rebuttal-campaign-generator";

export default function RebuttalPage() {
  return (
    <ToolPage
      eyebrow="Rapid Rebuttal"
      title="Rebuttal Campaign Generator"
      desc="Turn a false narrative into a full multi-activist, multi-platform rebuttal campaign with anchor phrase, lenses, and ready-to-post content."
      accentColor="var(--terracotta)"
      chainTo={{ label: "Generate proactive messaging? Try the Message Machine", path: "/messaging" }}
    >
      <RebuttalGenerator />
    </ToolPage>
  );
}
