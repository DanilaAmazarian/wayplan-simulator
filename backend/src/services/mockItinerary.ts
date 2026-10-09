import type { GenerateTripRequest } from '@travel/shared';
import type { GeneratedItem, GeneratedItinerary } from './openai.js';

/** Демо-точки (Рим) для разработки без обращения к OpenAI (OPENAI_MOCK=1). */
const ROME_POOL: GeneratedItem['location'][] = [
  { name: 'Колизей', description: 'Крупнейший амфитеатр Древнего Рима.', type: 'attraction', address: 'Piazza del Colosseo, 1', lat: 41.8902, lng: 12.4922 },
  { name: 'Римский форум', description: 'Центр общественной жизни античного Рима.', type: 'attraction', address: 'Via della Salara Vecchia, 5/6', lat: 41.8925, lng: 12.4853 },
  { name: 'Trattoria Luzzi', description: 'Простая траттория с римской кухней рядом с Колизеем.', type: 'restaurant', address: 'Via di S. Giovanni in Laterano, 88', lat: 41.8892, lng: 12.4978 },
  { name: 'Пантеон', description: 'Храм всех богов с уникальным куполом.', type: 'attraction', address: 'Piazza della Rotonda', lat: 41.8986, lng: 12.4769 },
  { name: 'Фонтан Треви', description: 'Самый знаменитый фонтан Рима.', type: 'attraction', address: 'Piazza di Trevi', lat: 41.9009, lng: 12.4833 },
  { name: 'Площадь Навона', description: 'Барочная площадь с тремя фонтанами.', type: 'attraction', address: 'Piazza Navona', lat: 41.8992, lng: 12.4731 },
  { name: "Sant'Eustachio Il Caffè", description: 'Легендарная кофейня с 1938 года.', type: 'cafe', address: "Piazza di S. Eustachio, 82", lat: 41.8981, lng: 12.4753 },
  { name: 'Музеи Ватикана', description: 'Коллекции пап и Сикстинская капелла.', type: 'museum', address: 'Viale Vaticano', lat: 41.9065, lng: 12.4536 },
  { name: 'Собор Святого Петра', description: 'Главный храм католического мира.', type: 'attraction', address: 'Piazza San Pietro', lat: 41.9022, lng: 12.4539 },
  { name: "Замок Святого Ангела", description: 'Мавзолей Адриана, ставший папской крепостью.', type: 'museum', address: 'Lungotevere Castello, 50', lat: 41.9031, lng: 12.4663 },
  { name: 'Da Enzo al 29', description: 'Популярная траттория в Трастевере.', type: 'restaurant', address: 'Via dei Vascellari, 29', lat: 41.8879, lng: 12.4776 },
  { name: 'Вилла Боргезе', description: 'Большой парк с галереей Боргезе.', type: 'park', address: 'Piazzale Napoleone I', lat: 41.9142, lng: 12.4923 },
  { name: 'Испанская лестница', description: 'Барочная лестница у церкви Тринита-деи-Монти.', type: 'attraction', address: 'Piazza di Spagna', lat: 41.9058, lng: 12.4823 },
  { name: 'Via del Corso', description: 'Главная торговая улица исторического центра.', type: 'shopping', address: 'Via del Corso', lat: 41.9028, lng: 12.4799 },
  { name: 'Freni e Frizioni', description: 'Бар для аперитива в Трастевере.', type: 'nightlife', address: 'Via del Politeama, 4', lat: 41.8912, lng: 12.4701 },
];

const SLOTS: [string, string][] = [
  ['09:00', '10:30'],
  ['11:00', '12:30'],
  ['13:00', '14:00'],
  ['14:30', '16:00'],
  ['16:30', '18:00'],
];

export function mockItinerary(req: GenerateTripRequest): GeneratedItinerary {
  const perDay = SLOTS.length;
  return {
    title: `${req.destination}: демо-маршрут на ${req.durationDays} дн.`,
    days: Array.from({ length: req.durationDays }, (_, d) => ({
      dayNumber: d + 1,
      title: `День ${d + 1}`,
      items: SLOTS.map(([startTime, endTime], i) => ({
        startTime,
        endTime,
        transport: i === 0 ? 'walk' : i % 2 ? 'walk' : 'metro',
        notes: null,
        location: ROME_POOL[(d * perDay + i) % ROME_POOL.length]!,
      })),
    })),
  };
}
