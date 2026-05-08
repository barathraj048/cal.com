import process from "node:process";
import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { symmetricEncrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import type { NextApiRequest, NextApiResponse } from "next";
import getInstalledAppPath from "../../_utils/getInstalledAppPath";
import appConfig from "../config.json";

const log = logger.getSubLogger({
  prefix: ["[protoncalendar/api/add]"],
});

const ALLOWED_PROTON_DOMAINS = ["calendar.proton.me", "calendar.protonmail.com", "calendar.protonmail.ch"];

function isProtonURL(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") {
      return false;
    }

    return ALLOWED_PROTON_DOMAINS.some((domain) => {
      return parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`);
    });
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method === "GET") {
    return res.status(200).json({
      url: "/apps/protoncalendar/setup",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      message: "Method Not Allowed",
    });
  }

  const session = await getServerSession({ req });
  const userId = (session?.user as { id?: number })?.id;

  if (!userId) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  const { urls } = req.body ?? {};

  if (!Array.isArray(urls) || urls.length !== 1 || !urls.every((url) => typeof url === "string")) {
    return res.status(400).json({
      message: "urls must be a non-empty array with exactly one string",
    });
  }

  const url = urls[0];

  if (!isProtonURL(url)) {
    return res.status(400).json({
      message: "Invalid Proton Calendar URL",
    });
  }

  const encryptionKey = process.env.CALENDSO_ENCRYPTION_KEY;

  if (!encryptionKey) {
    return res.status(500).json({
      message: "Missing encryption key",
    });
  }

  try {
    const user = await prisma.user.findFirstOrThrow({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
      },
    });

    // Verify the ICS feed is reachable and looks valid before saving
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Could not access Proton ICS feed");
    }

    const text = await response.text();

    if (!text.includes("BEGIN:VCALENDAR")) {
      throw new Error("Invalid ICS feed");
    }

    const encryptedKey = symmetricEncrypt(url, encryptionKey);

    const data = {
      type: appConfig.type,
      key: {
        encryptedUrl: encryptedKey,
      },
      userId: user.id,
      teamId: null,
      appId: appConfig.slug,
      invalid: false,
      delegationCredentialId: null,
    };

    await prisma.credential.create({
      data,
    });

    return res.status(200).json({
      url: getInstalledAppPath({
        variant: "calendar",
        slug: "proton",
      }),
    });
  } catch (error) {
    log.error("Failed to add Proton Calendar", error);

    return res.status(500).json({
      message: "Could not add Proton Calendar",
    });
  }
}
