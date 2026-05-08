import process from "node:process";
import dayjs from "@calcom/dayjs";
import { symmetricDecrypt } from "@calcom/lib/crypto";
import logger from "@calcom/lib/logger";
import type { Calendar, CalendarEvent, EventBusyDate, IntegrationCalendar } from "@calcom/types/Calendar";
import type { CredentialPayload } from "@calcom/types/Credential";
import ICAL from "ical.js";

const log = logger.getSubLogger({ prefix: ["[protoncalendar/lib/CalendarService]"] });

export default class ProtonCalendarService implements Calendar {
  private url: string;
  private integrationName = "protoncalendar_other_calendar";

  constructor(credential: CredentialPayload) {
    const encryptionKey = process.env.CALENDSO_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("Missing CALENDSO_ENCRYPTION_KEY");
    }

    if (!credential.key) {
      throw new Error("Proton Calendar credential is missing encrypted key");
    }

    const keyData = credential.key as unknown as { encryptedUrl: string };
    this.url = symmetricDecrypt(keyData.encryptedUrl, encryptionKey);
  }

  async createEvent(): Promise<any> {
    log.debug("createEvent called, but Proton is read-only. Skipping.");
    return {
      uid: "",
      id: "",
      type: this.integrationName,
      password: "",
      url: "",
      additionalInfo: { readOnly: true },
    };
  }

  async updateEvent(_uid: string, _event: CalendarEvent): Promise<any> {
    return undefined;
  }

  async deleteEvent(_uid: string, _event: CalendarEvent): Promise<any> {
    return undefined;
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
        redirect: "follow",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch Proton ICS: ${response.status} ${response.statusText}`);
      }

      const icsData = await response.text();
      const filteredIcsData = this.removeCancelledEvents(icsData);

      return this.parseIcsToBusyDates(filteredIcsData, dateFrom, dateTo);
    } catch (error) {
      log.error("Failed to get Proton availability", error);
      return [];
    }
  }

  private removeCancelledEvents(icsString: string): string {
    const eventBlocks = icsString.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
    let cleanedIcs = icsString;

    for (const block of eventBlocks) {
      if (block.includes("STATUS:CANCELLED")) {
        cleanedIcs = cleanedIcs.replace(block, "");
      }
    }

    return cleanedIcs;
  }

  private parseIcsToBusyDates(icsData: string, dateFrom: string, dateTo: string): EventBusyDate[] {
    const busyDates: EventBusyDate[] = [];
    const startWindow = dayjs(dateFrom).toDate();
    const endWindow = dayjs(dateTo).toDate();

    const jcalData = ICAL.parse(icsData);
    const component = new ICAL.Component(jcalData);
    const vevents = component.getAllSubcomponents("vevent");

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);

      const startDate = event.startDate?.toJSDate?.();
      const endDate = event.endDate?.toJSDate?.();

      if (!startDate || !endDate) {
        continue;
      }

      const durationMs = Math.max(endDate.getTime() - startDate.getTime(), 0);

      const isRecurring =
        typeof (event as any).isRecurring === "function" ? (event as any).isRecurring() : false;

      if (isRecurring) {
        const RecurExpansion = (ICAL as any).RecurExpansion;
        const expander = new RecurExpansion({ component: vevent, dtstart: event.startDate });

        let count = 0;
        let next = expander.next();

        while (next && count < 300) {
          const occurrence = next.toJSDate ? next.toJSDate() : new Date(next);
          if (occurrence >= startWindow && occurrence < endWindow) {
            busyDates.push({
              start: occurrence.toISOString(),
              end: new Date(occurrence.getTime() + durationMs).toISOString(),
            });
          }

          next = expander.next();
          count += 1;
        }

        continue;
      }

      if (endDate > startWindow && startDate < endWindow) {
        busyDates.push({
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        });
      }
    }

    return busyDates;
  }
}
