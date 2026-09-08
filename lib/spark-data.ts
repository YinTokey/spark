export type Idea = {
  id: string;
  title: string;
  note: string;
  date: string;
  time: string;
  status: "Raw" | "Shaped";
};

export type Script = {
  id: string;
  title: string;
  status: "Ready to record" | "Draft" | "Editing";
  ideaIds: string[];
  hook: string;
  points: string[];
  outro: string;
  duration: string;
};

// In-memory demo fixtures. Replace these at the integration boundary when an API is available.
export const sampleIdeas: Idea[] = [
  { id: "agents", title: "AI agents are becoming managers", note: "The interesting shift isn't that AI writes code. It's that our job is becoming more about setting direction, giving context, and reviewing the result. We're learning to manage a team that happens to be made of agents.", date: "Today", time: "12:42 PM", status: "Shaped" },
  { id: "walking", title: "Why walking helps me think", note: "My best ideas rarely arrive at my desk. A walk gives a half-formed thought enough room to become something. Maybe the most productive thing I can do is step away.", date: "Today", time: "9:18 AM", status: "Raw" },
  { id: "tools", title: "Creator tools should disappear", note: "The best creative tools get out of the way. I want to capture the thought before I think about the interface. Less organizing, more making.", date: "Today", time: "8:03 AM", status: "Shaped" },
  { id: "hooks", title: "The problem with AI hooks", note: "A hook can be technically perfect and still feel empty. Specificity and lived experience are what make someone want to keep listening.", date: "Yesterday", time: "6:31 PM", status: "Raw" },
  { id: "workflow", title: "My 10x workflow", note: "Capture immediately. Connect ideas weekly. Make one small thing every day. A workflow should protect the time I spend creating.", date: "Yesterday", time: "11:04 AM", status: "Shaped" },
  { id: "consistency", title: "Consistency over perfection", note: "Showing up is a skill. Every small finished piece teaches me more than another week polishing something nobody has seen.", date: "Sep 4", time: "3:21 PM", status: "Raw" },
  { id: "reviewers", title: "Humans are becoming reviewers", note: "When AI makes the first draft, judgment becomes the scarce skill. Knowing what good looks like matters more than ever.", date: "Sep 4", time: "10:20 AM", status: "Shaped" },
  { id: "specs", title: "Specs matter more than code", note: "A clear description of the outcome is becoming the highest-leverage part of building software. Clarity is the new craft.", date: "Sep 4", time: "9:05 AM", status: "Shaped" },
];

export const sampleScripts: Script[] = [
  { id: "ai-management", title: "Why AI coding is becoming management", status: "Ready to record", ideaIds: ["agents", "reviewers", "specs"], duration: "1 min", hook: "You may already be managing AI agents without realizing it.", points: ["Coding is shifting from writing code to directing AI agents.", "The skillset is changing. Clear instructions and good judgment matter more than typing speed.", "For developers, this means learning to define the problem, review the work, and connect the pieces."], outro: "The future isn’t about writing more code. It’s about thinking at a higher level." },
  { id: "creator-workflow", title: "My creator workflow in 2026", status: "Draft", ideaIds: ["tools", "workflow", "consistency", "hooks", "walking"], duration: "2 min", hook: "My creative workflow got better when I started doing less.", points: ["Capture the thought while it's fresh, without worrying about where it belongs.", "Look for connections between the things you keep coming back to.", "Turn one clear idea into something you can share. Then do it again tomorrow."], outro: "Your tools should leave you with more energy to create. Start small, and keep showing up." },
  { id: "walking-lessons", title: "What I learned from walking", status: "Editing", ideaIds: ["walking", "consistency"], duration: "1 min", hook: "I went for a walk to take a break. I came back with the idea I’d been looking for all day.", points: ["A change of scenery gives your thoughts room to move.", "Leave the headphones at home sometimes. Notice what comes up in the quiet.", "You don't need a breakthrough every day. A little space is enough."], outro: "Sometimes moving forward means stepping away from your desk." },
];
