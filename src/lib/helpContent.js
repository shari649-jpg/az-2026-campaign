// Centralized copy for every 🕵️‍♂️ help pop-up in the Comms Hub.
// Keeping it in one file means updating a tooltip's wording never touches
// component code, and makes it easy to see everything at a glance for review.
//
// Usage:
//   import { HELP } from "../../lib/helpContent";
//   <HelpTooltip text={HELP.messageMachine.issue} label="Help: Issue field" />
//
// Adding a new one: pick the right page section below, add a key, then wire
// it up in the component. Keep entries to 1-2 sentences — if it needs more
// than that, it probably belongs in the User Manual instead, with a
// "Learn more" link from here rather than a longer pop-up.

export const HELP = {
  messageMachine: {
    issue:
      "Describe what you want to talk about, in your own words. The more specific you are, the sharper your message will be.",
    audience:
      "Who is this message speaking to? (e.g. \"suburban parents,\" \"young voters.\") This shapes the tone of every platform's post.",
    platforms:
      "Pick which platforms you want posts for. You don't have to generate all six every time.",
    mode:
      "Neutral works for general messaging. Choose AZ Coalition for our Arizona-grounded voice, or National for national messaging frames.",
    generate:
      "This takes about 10–25 seconds — it's writing all your selected platforms at once.",
    refine:
      "Not quite right? These regenerate that one post — longer, shorter, or reworded — without touching the others.",
    copy:
      "Copies just this platform's post to your clipboard, ready to paste and publish.",
    saveLibrary:
      "Stores this whole campaign in the Shared Library so you (or a teammate) can find and reuse it later. Nothing saves unless you click this.",
    pushToStorm:
      "Sends this post straight into a Storm campaign. (Managers/Administrators only.)",

    // Pro Mode
    proModeToggle:
      "Extra controls for framing, voice, and local grounding. Collapsed by default — open it when you want finer control over a message.",
    messagingFrame:
      "Focuses the whole message around one strategic theme. Leave it blank for general-purpose messaging.",
    countyVoice:
      "Grounds your message in one of Arizona's 15 counties — its local stakes and landmarks. This is separate from Voice/Persona below, so you can set both.",
    countyDetected:
      "We noticed a single, clear county in what you sent over. Apply its voice, or dismiss this — your call.",
    voicePersona:
      "Pick a preset to instantly fill in a detailed voice style — then edit it however you like. Click the preset again to clear it.",
    audienceStyleTone:
      "Dial in exactly who this is for, how formal it reads, its emotional tone, and whose perspective it's written from.",
    urlIngest:
      "You can drop a news link right in — no need to detour through Rapid Response first.",
    hashtags:
      "Suggests hashtags based on the campaign you just generated.",
  },

  rapidResponse: {
    fetchUrl:
      "Paste a link to a news article and we'll pull out the key claims and quotes for you.",
    pasteText:
      "Already have the article copied? Paste it directly here instead of fetching a link.",
    searchTab:
      "Looking for coverage on a topic rather than one specific article? Search here instead.",
    sendToMessageMachine:
      "Carries this article's summary straight into Message Machine so you can turn it into platform posts.",
    saveLibrary:
      "Keeps this article and its summary in the Shared Library for later.",
  },

  rebuttal: {
    claim:
      "Enter the specific lie or misleading claim you're countering. Be precise — the sharper your description, the sharper the rebuttal.",
    toneProfile:
      "Optional. Shapes how the rebuttal sounds. The defaults work fine if you're not sure.",
    copyAll:
      "Copies the full rebuttal text to your clipboard.",
    editRegenerate:
      "Tweak your claim, tone, or profile and generate again — no need to start over.",
    pushToMessageMachine:
      "Turns this rebuttal into ready-to-post platform messages.",
    libraryPanel:
      "Your past rebuttals live here for quick reuse, alongside the full Shared Library.",
  },

  research: {
    searchCandidates:
      "Look up a candidate directly and review their record.",
    compareRaces:
      "See candidates in a race side by side, with district context.",
    geoProfiles:
      "Browse district- and county-level profiles, including which counties fall inside a district.",
    issues:
      "Browse coalition-tracked issues, each with an at-a-glance severity rating.",
    checkboxes:
      "Check the ones you want to use, then send them straight to Message Machine — no copy-pasting.",
    sendBar:
      "Carries everything you've checked into a new message.",
  },

  media: {
    fileBrowser:
      "Browse, search, and filter the coalition's shared photos and videos by type.",
    lightbox:
      "Click any image or GIF to see it full-size before you download it.",
    download:
      "Saves the file to your device so you can use it in your own post.",
    graphicsStudio:
      "Turn a quote or stat into a branded quote card or carousel graphic using our ready-made templates.",
  },

  library: {
    searchFilters:
      "Narrow the list by tool (Message Machine, Rebuttal, Rapid Response) or search by keyword.",
    openCampaign:
      "Loads it back into the tool that made it, exactly as it was — ready to edit or regenerate.",
    openArticle:
      "Pushes it into Message Machine as a fresh starting point.",
    deletePermissions:
      "You can delete your own saved items anytime. Managers and Administrators can delete any item.",
  },

  storms: {
    viewToggle:
      "Switch to User View to preview exactly what a Member sees. (Managers/Administrators only.)",
    newStorm:
      "Starts a new coordinated campaign. It always begins as a Draft — even if you're staff.",
    statusDropdown:
      "Draft → Pending Review → Active → Archived. Members can submit their own draft for review; only staff can make a storm Active.",
    urgency:
      "A 1–3 scale showing how time-sensitive this storm is.",
    postsPanel:
      "Add a video or graphics, plus text for each platform, to this storm. Character limits show live as you type.",
    generateRephrase:
      "Writes or reworks this platform's text using the same AI tool that powers Message Machine.",
    lock:
      "Locks this platform's text so it can't be edited further. Shows a \"🔒 Locked by staff\" tag. (Managers/Administrators only.)",
    pushToStorm:
      "Sends a finished Message Machine post straight into an existing storm, or starts a new one from it. (Managers/Administrators only.) Media isn't included automatically — add that separately.",
    publicLink:
      "A shareable link anyone can view — handy for supporters posting outside the coalition's own accounts.",
  },
};
