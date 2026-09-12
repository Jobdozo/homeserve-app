// Pure UI/business constants that aren't owned by the backend.
// Categories, services, providers, bookings and messages now come from the
// live API (see src/api.js) so both apps share one source of truth.

export const timeSlots = [
  "08:00 AM – 10:00 AM",
  "10:00 AM – 12:00 PM",
  "12:00 PM – 02:00 PM",
  "02:00 PM – 04:00 PM",
  "04:00 PM – 06:00 PM",
];

export const defaultAddress = {
  label: "Home",
  line: "221B, Baker Street, Connaught Place, New Delhi - 110001",
};

// Statuses in order — drives the booking progress timeline.
export const STATUS_STEPS = ["Pending", "Accepted", "In Progress", "Completed"];
