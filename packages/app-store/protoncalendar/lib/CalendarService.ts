import process from "node:process";
import { getBusyTimesFromIcs } from "@calcom/app-store/ics-feedcalendar/lib/shared";
import { symmetricDecrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import type { Calendar, CalendarEvent, EventBusyDate, IntegrationCalendar } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";

const log = logger.getSubLogger({ prefix: ["[protoncalendar/lib/CalendarService]"] });

export default class ProtonCalendarService implements Calendar {
  private url: string;
  private integrationName = "protoncalendar";

  constructor(credential: CredentialPayload) {
    // FIXED: Strict casting for the nested JSON key
    const keyData = credential.key as unknown as { encryptedUrl: string };
    this.url = symmetricDecrypt(keyData.encryptedUrl, process.env.CALENDSO_ENCRYPTION_KEY as string);
  }

  // FIXED: Added return types and mapped exact parameters
  async createEvent(): Promise<any> {
    log.debug("createEvent called, but Proton is read-only. Skipping.");
    return Promise.resolve({
      uid: "",
      id: "",
      type: this.integrationName,
      password: "",
      url: "",
      additionalInfo: { readOnly: true },
    });
  }

  async updateEvent(_uid: string, _event: CalendarEvent): Promise<any> {
    return Promise.resolve(undefined);
  }

  async deleteEvent(_uid: string, _event: CalendarEvent): Promise<any> {
    return Promise.resolve(undefined);
  }

  async listCalendars(): Promise<IntegrationCalendar[]> {
    return [
      {
        externalId: "proton-calendar",
        integration: this.integrationName,
        name: "Proton Calendar",
        primary: true,
        readOnly: true,
      },
    ];
  }

  // FIXED: Unpacked the params object to match the new Interface
  async getAvailability({
    dateFrom,
    dateTo,
  }: {
    dateFrom: string;
    dateTo: string;
    selectedCalendars: IntegrationCalendar[];
  }): Promise<EventBusyDate[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(this.url, {
        signal: controller.signal,
        redirect: "manual",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch Proton ICS: ${response.statusText}`);
      }

      const icsData = await response.text();
      const filteredIcsData = this.removeCancelledEvents(icsData);

      return await getBusyTimesFromIcs(filteredIcsData, dateFrom, dateTo);
    } catch (error) {
      log.error("Failed to get Proton availability", error);
      return [];
    }
  }

  private removeCancelledEvents(icsString: string): string {
    const eventBlocks = icsString.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
    let cleanedIcs = icsString;

    eventBlocks.forEach((block) => {
      if (block.includes("STATUS:CANCELLED")) {
        cleanedIcs = cleanedIcs.replace(block, "");
      }
    });

    return cleanedIcs;
  }
}
