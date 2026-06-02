import ToolPage from "../../components/ToolPage";
import CandidateQuery from "./CandidateQuery";

export default function ResearchPage() {
  return (
    <ToolPage
      eyebrow="Intel"
      title="Candidate Research"
      desc="Candidate details and issues that are in the candidate public record. More candidates are added daily."
      accentColor="#1D5C4A"
    >
      <CandidateQuery />
    </ToolPage>
  );
}
