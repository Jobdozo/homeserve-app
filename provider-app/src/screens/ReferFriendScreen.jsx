import { useState } from "react";
import ScreenHeader from "../components/ScreenHeader";
import { useApp } from "../context/AppContext";

const APP_LINK = "https://play.google.com/store/apps/details?id=com.tikdum.provider";

function inviteMessage(name) {
  const greeting = name ? `Hi ${name}, ` : "";
  return `${greeting}I'm using Tikdum Pro to get more service bookings and manage my jobs — thought you'd find it useful too. Download it here: ${APP_LINK}`;
}

// The Contact Picker API only exists on Chrome for Android (which is what
// a TWA runs on), so this degrades gracefully everywhere else to "just
// share the invite link with whoever you want" instead.
const contactPickerSupported = typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

export default function ReferFriendScreen() {
  const { showToast } = useApp();
  const [picked, setPicked] = useState(null);
  const [picking, setPicking] = useState(false);

  const pickContact = async () => {
    setPicking(true);
    try {
      const [contact] = await navigator.contacts.select(["name", "tel"], { multiple: false });
      if (contact) setPicked(contact);
    } catch (e) {
      // User cancelled the picker, or the browser refused — either way,
      // nothing to show; they can still use "Share invite" below.
    } finally {
      setPicking(false);
    }
  };

  const shareWith = async (name) => {
    const message = inviteMessage(name);
    if (navigator.share) {
      try {
        await navigator.share({ text: message });
        return;
      } catch (e) {
        // user cancelled the share sheet — fall through to clipboard copy
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      showToast("Invite message copied — paste it anywhere to share");
    } catch (e) {
      showToast("Couldn't share — try again");
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title="Refer a Friend" />

      <div className="flex-1 space-y-5 px-4 pb-6 lg:mx-auto lg:w-full lg:max-w-2xl lg:px-8 lg:pb-10">
        <div className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-5 text-white">
          <p className="text-2xl">🎁</p>
          <p className="mt-2 text-[15px] font-bold">Know another service provider?</p>
          <p className="mt-1 text-[12.5px] text-white/85">
            Invite them to join Tikdum Pro and grow their business too.
          </p>
        </div>

        {contactPickerSupported && (
          <div>
            <h2 className="mb-2 text-[13px] font-bold text-gray-900">Pick from contacts</h2>
            <button
              onClick={pickContact}
              disabled={picking}
              className="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 disabled:opacity-50"
            >
              {picking ? "Opening contacts…" : "Choose a contact"}
            </button>

            {picked && (
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-gray-100 p-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-gray-800">{picked.name?.[0] || "Contact"}</p>
                  <p className="text-[11px] text-gray-400">{picked.tel?.[0]}</p>
                </div>
                <button
                  onClick={() => shareWith(picked.name?.[0])}
                  className="flex-shrink-0 rounded-xl bg-brand px-4 py-2 text-[12px] font-semibold text-white"
                >
                  Invite
                </button>
              </div>
            )}
          </div>
        )}

        <div>
          <h2 className="mb-2 text-[13px] font-bold text-gray-900">Or share directly</h2>
          <button
            onClick={() => shareWith()}
            className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white active:scale-[0.98]"
          >
            Share invite link
          </button>
          <p className="mt-2 px-1 text-[11px] text-gray-400">
            Opens your phone's share sheet — send it over WhatsApp, SMS, or anywhere else.
          </p>
        </div>
      </div>
    </div>
  );
}
