import ToolPage from "../../components/ToolPage";
import MessageMachine from "./message-machine";

export default function MessagingPage() {
  return (
    <ToolPage
      eyebrow="Comms"
      title="Message Machine"
      desc="Generate platform-ready social media posts tailored to issue, audience, voice, and style."
      chainTo={{ label: "Need to rebut a false narrative? Try the Rebuttal Generator", path: "/rebuttal" }}
    >
      <MessageMachine />
    </ToolPage>
  );
}
