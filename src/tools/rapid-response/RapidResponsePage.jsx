import ToolPage from "../../components/ToolPage";
import RapidResponseReader from "./rapid-response-reader";

export default function RapidResponsePage() {
  return (
    <ToolPage
      eyebrow="Rapid Response"
      title="Article Reader & Analyzer"
      desc="Analyze a news article for detailed key points, people, and quotes — or search the web to find one."
      chainTo={{ label: "Found a false narrative in this article? Try the Rebuttal Generator", path: "/rebuttal" }}
      premium
    >
      <RapidResponseReader />
    </ToolPage>
  );
}
