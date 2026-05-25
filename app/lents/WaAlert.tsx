import { sendWhatsAppAlert } from "@/lib/whatsapp";

// --- Interfaces ---
interface Profile {
  name: string;
  phone?: string;
}

// খালি বা নাল ডাটা এড়ানোর জন্য স্যানিটাইজার
const sanitizeText = (text: string | number | undefined | null) => {
  if (text === undefined || text === null || text === "") return "N/A";
  // Invisible unicode spaces বা newlines রিমুভ করে ক্লিন টেক্সট রিটার্ন করবে
  return String(text).replace(/[\u202F\u00A0]/g, ' ').replace(/[\r\n\t]+/g, ' ').trim();
};

/**
 * নতুন লোন (Lent) দেওয়ার পর অ্যালার্ট
 */
export const sendLentIssueAlert = async (
  profiles: Profile[],
  entryUserName: string,
  borrowerName: string,
  amount: number,
  sourceName: string,
  remainingBalance: number,
  totalDueLent: number,
  dueDate: string,
  remarks: string
) => {
  const nowTime = new Date();
  const timeStr = nowTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

  const promises = profiles.map(async (profile) => {
    const cleanPhone = (profile.phone || "").replace(/[^0-9]/g, '');
    if (cleanPhone.length >= 10) {
      // Meta Standard Components Array
      const alertComponents = [
        {
          type: "header",
          parameters: [
            { type: "text", parameter_name: "borrower_name", text: sanitizeText(borrowerName) }
          ]
        },
        {
          type: "body",
          parameters: [
            { type: "text", parameter_name: "greeting_user", text: sanitizeText(profile.name) },
            { type: "text", parameter_name: "borrower_name", text: sanitizeText(borrowerName) },
            { type: "text", parameter_name: "source_name", text: sanitizeText(sourceName) },
            { type: "text", parameter_name: "entry_user", text: sanitizeText(entryUserName) },
            { type: "text", parameter_name: "time", text: sanitizeText(timeStr) },
            { type: "text", parameter_name: "amount", text: sanitizeText(amount) },
            { type: "text", parameter_name: "due_date", text: sanitizeText(dueDate) },
            { type: "text", parameter_name: "remarks", text: sanitizeText(remarks) },
            { type: "text", parameter_name: "remaining_balance", text: sanitizeText(remainingBalance) },
            { type: "text", parameter_name: "total_due_lent", text: sanitizeText(totalDueLent) }
          ]
        }
      ];

      await sendWhatsAppAlert(cleanPhone, "lent_issue_alert", alertComponents);
    }
  });

  await Promise.all(promises);
};

/**
 * লোন রিকভারি (Lent Recovery) অ্যালার্ট
 */
export const sendLentRecoveryAlert = async (
  profiles: Profile[],
  entryUserName: string,
  borrowerName: string,
  fullOrPartial: string,
  amount: number,
  fullAmount: string,
  receivedOn: string,
  currentBal: number,
  remainingDue: number,
  remarks: string
) => {
  const nowTime = new Date();
  const timeStr = nowTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

  const promises = profiles.map(async (profile) => {
    const cleanPhone = (profile.phone || "").replace(/[^0-9]/g, '');
    if (cleanPhone.length >= 10) {
      // Meta Standard Components Array
      const alertComponents = [
        {
          type: "header",
          parameters: [
            { type: "text", parameter_name: "borrower_name", text: sanitizeText(borrowerName) }
          ]
        },
        {
          type: "body",
          parameters: [
            { type: "text", parameter_name: "greeting_user", text: sanitizeText(profile.name) },
            { type: "text", parameter_name: "borrower_name", text: sanitizeText(borrowerName) },
            { type: "text", parameter_name: "full_or_partial", text: sanitizeText(fullOrPartial) },
            { type: "text", parameter_name: "entry_user", text: sanitizeText(entryUserName) },
            { type: "text", parameter_name: "time", text: sanitizeText(timeStr) },
            { type: "text", parameter_name: "amount", text: sanitizeText(amount) },
            { type: "text", parameter_name: "full_ammount", text: sanitizeText(fullAmount) },
            { type: "text", parameter_name: "remarks", text: sanitizeText(remarks) },
            { type: "text", parameter_name: "received_on", text: sanitizeText(receivedOn) },
            { type: "text", parameter_name: "current_bal", text: sanitizeText(currentBal) },
            { type: "text", parameter_name: "remaining_due", text: sanitizeText(remainingDue) }
          ]
        }
      ];

      await sendWhatsAppAlert(cleanPhone, "lent_recovery_alert", alertComponents);
    }
  });

  await Promise.all(promises);
};