import process from "node:process";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { symmetricEncrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import { defaultHandler, defaultResponder } from "@calcom/lib/server";
import prisma from "@calcom/prisma";
import type { NextApiRequest, NextApiResponse } from "next";

const log = logger.getSubLogger({ prefix: ["[protoncalendar/api/add]"] });

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  // THE FIX: When the user clicks "Install", redirect them to our Setup UI!
  if (req.method === "GET") {
    res.status(200).json({ url: "/apps/protoncalendar/setup" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ message: "Method Not Allowed" });
    return;
  }

  const session = await getServerSession({ req });
  const userId = (session?.user as { id?: number })?.id;

  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const { url } = req.body;

  if (!url || typeof url !== "string") {
    res.status(400).json({ message: "Proton ICS URL is required" });
    return;
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== "calendar.proton.me" || parsedUrl.protocol !== "https:") {
      log.warn(`Invalid Proton domain attempted by user ${userId}`);
      res.status(400).json({ message: "Invalid Proton Calendar URL" });
      return;
    }
  } catch {
    res.status(400).json({ message: "Malformed URL" });
    return;
  }

  try {
    const encryptedUrl = symmetricEncrypt(url, process.env.CALENDSO_ENCRYPTION_KEY as string);

    await prisma.credential.create({
      data: {
        type: "protoncalendar_other_calendar",
        key: { encryptedUrl },
        userId: userId,
        appId: "protoncalendar",
      },
    });

    res.status(200).json({ url: "/apps/installed/calendar" });
  } catch (error) {
    log.error("Failed to add Proton Calendar", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

// THE FIX: Ensure GET is explicitly exposed to the defaultHandler
export default defaultHandler({
  GET: Promise.resolve({ default: defaultResponder(handler) }),
  POST: Promise.resolve({ default: defaultResponder(handler) }),
});
