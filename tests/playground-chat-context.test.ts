import { formatPlaygroundContext, PlaygroundContext } from "../app/api/chat/route";

async function runTests() {
  console.log("=================================================");
  console.log("RUNNING PLAYGROUND CHAT CONTEXT TEST SUITE");
  console.log("=================================================");

  // Test 1: Full context formatting
  const mockContext: PlaygroundContext = {
    playgroundId: "test-playground-123",
    playgroundTitle: "React Counter App",
    template: "REACT",
    fileTree: ["src/App.tsx", "src/index.css", "package.json"],
    activeFile: {
      filename: "App",
      fileExtension: "tsx",
      path: "src/App.tsx",
      content: "export default function App() { return <div>Counter</div>; }",
      selectedCode: "return <div>Counter</div>;",
      selectedRange: { startLine: 1, endLine: 1 },
    },
  };

  const formatted = formatPlaygroundContext(mockContext);

  if (!formatted.includes("<playground_context>") || !formatted.includes("</playground_context>")) {
    throw new Error("Missing playground_context tags");
  }
  console.log("  [PASS] Context contains safe <playground_context> delimiters");

  if (!formatted.includes('Current Project: "React Counter App" (REACT environment)')) {
    throw new Error("Project metadata missing in context");
  }
  console.log("  [PASS] Project title and template framework properly formatted");

  if (!formatted.includes("src/App.tsx") || !formatted.includes("package.json")) {
    throw new Error("File tree paths missing in context");
  }
  console.log("  [PASS] File tree structure properly listed");

  if (!formatted.includes("User Selected Code Snippet (Lines 1-1):") || !formatted.includes("return <div>Counter</div>;")) {
    throw new Error("Selected snippet missing from context");
  }
  console.log("  [PASS] Monaco selected code snippet with line numbers correctly extracted");

  // Test 2: Truncation guard on oversized content
  const oversizedCode = "a".repeat(50000);
  const oversizedContext: PlaygroundContext = {
    playgroundId: "test-large",
    playgroundTitle: "Large App",
    template: "NEXTJS",
    activeFile: {
      filename: "LargeFile",
      fileExtension: "ts",
      content: oversizedCode,
    },
  };

  const formattedOversized = formatPlaygroundContext(oversizedContext);
  if (!formattedOversized.includes("[truncated]")) {
    throw new Error("Oversized content was not truncated");
  }
  console.log("  [PASS] Oversized code content capped safely to prevent token explosion");

  console.log("\nALL PLAYGROUND CHAT TESTS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
