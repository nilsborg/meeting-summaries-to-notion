export async function showNotification(
  title: string,
  description: string,
  link?: string
) {
  const args = ["-title", title, "-message", description, "-sound", "default"];

  // Add link handling if provided
  if (link) {
    args.push("-open", link);
  }

  try {
    const command = new Deno.Command("/opt/homebrew/bin/terminal-notifier", {
      args: args,
    });

    const { code, stderr } = await command.output();

    if (code !== 0) {
      const errorOutput = new TextDecoder().decode(stderr);
      throw new Error(`Notification failed with error: ${errorOutput}`);
    }

    return true;
  } catch (error) {
    console.error("Failed to show notification:", error);
    return false;
  }
}
