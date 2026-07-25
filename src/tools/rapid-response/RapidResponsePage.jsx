import ToolPage from "../../components/ToolPage";
import RapidResponseReader from "./rapid-response-reader";

export default function RapidResponsePage() {
  return (
    <ToolPage
      eyebrow="Rapid Response"
      title="Article Reader & Analyzer"
      desc="Analyze a news article for key points, tone, and rapid-response angles — or search the web to find one."
      chainTo={{ label: "Found a false narrative in this article? Try the Rebuttal Generator", path: "/rebuttal" }}
    >
      <RapidResponseReader />
    </ToolPage>
  );
}
