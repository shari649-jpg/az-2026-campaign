import ToolPage from "../../components/ToolPage";
import CandidateQuery from "./CandidateQuery";

export default function ResearchPage() {
  return (
    <ToolPage
      eyebrow="Intel"
      title="Candidate Research"
      desc="Deep-dive profiles on candidates — positions, vulnerabilities, voting records, and district context."
      accentColor="#1D5C4A"
    >
      <CandidateQuery />
    </ToolPage>
  );
}
