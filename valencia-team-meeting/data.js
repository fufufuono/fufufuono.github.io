/* Public, non-sensitive meeting details only. No employee meal records are included. */
window.VALENCIA_DATA = {
  title: "JinkoSolar Europe Team Meeting 2026",
  timezone: "Europe/Madrid",
  dates: [
    { date: "2026-11-22", day: "Sun", number: 22, label: "Sunday" },
    { date: "2026-11-23", day: "Mon", number: 23, label: "Monday" },
    { date: "2026-11-24", day: "Tue", number: 24, label: "Tuesday" },
    { date: "2026-11-25", day: "Wed", number: 25, label: "Wednesday" },
    { date: "2026-11-26", day: "Thu", number: 26, label: "Thursday" },
    { date: "2026-11-27", day: "Fri", number: 27, label: "Friday" }
  ],
  hotel: {
    name: "ILUNION Aqua 4",
    address: "C/ de Luis García-Berlanga Martí, 19–21, 46023 Valencia, Spain"
  },
  dinners: [
    { date: "2026-11-22", time: "19:45", name: "Restaurante Pato Laqueado", address: "Calle del Escultor, C/ de Vicente Beltrán Grimal, 26, Camins al Grau, 46023 València, Valencia, Spain" },
    { date: "2026-11-23", time: "20:00", name: "Restaurante La Disfrutona", address: "Av. de l'Institut Obrer de València, 13, Quatre Carreres, 46013 València, Valencia, Spain" },
    { date: "2026-11-24", time: "20:00", name: "Tapearte Arrocería desde 1992", address: "Carrer Escultor, Carrer de Luis Bolinches Compañ, 10, 46023 València, Valencia, Spain" },
    { date: "2026-11-25", time: "20:00", name: "Número Uno Steakhouse", address: "Av. de les Balears, 32, Camins al Grau, 46023 València, Valencia, Spain" },
    { date: "2026-11-26", time: "20:00", name: "Restaurante Rocalla", address: "Av. de l'Institut Obrer de València, nº20, Quatre Carreres, 46013 València, Valencia, Spain" },
    { date: "2026-11-27", time: "19:45", name: "Restaurante Pato Laqueado", address: "Calle del Escultor, C/ de Vicente Beltrán Grimal, 26, Camins al Grau, 46023 València, Valencia, Spain" }
  ],
  teamActivity: {
    date: "2026-11-25",
    time: "15:00",
    title: "Valencia Treasure Hunt",
    meetingPoint: "ILUNION Aqua 4",
    destination: "Valencia Old Town",
    details: "Small-group treasure hunt in Valencia's historic city centre. Comfortable shoes and clothing recommended. Transportation arranged."
  },
  /* Add confirmed agenda sessions as:
     "2026-11-25": [
       { start: "09:00", end: "10:00", title: "...", presenter: "...", room: "...", notes: "..." }
     ]
     Do not invent session times or presenters. */
  meetingAgenda: {},
  /* Intentionally empty. Avoid publishing identifiable employee orders on a public GitHub Pages site.
     If public, consented, non-sensitive records are ever used:
     { date: "2026-11-25", name: "Public display name", courses: [{ label:"Main", value:"..." }] }
     A private access-controlled solution is preferable for real employee-name meal lookups. */
  mealSelections: []
};