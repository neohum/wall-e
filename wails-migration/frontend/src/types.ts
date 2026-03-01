// ===== Types mirroring Go structs =====

export interface Settings {
  schoolName: string;
  schoolCode: string;
  officeCode: string;
  grade: number;
  classNum: number;
  latitude: number;
  longitude: number;
  spreadsheetUrl: string;
  alarmEnabled: boolean;
  alarmSound: string;
  customAlarmData: string;
  customAlarmName: string;
  backgroundId: string;
  customBackgrounds: CustomBackground[];
}

export interface CustomBackground {
  id: string;
  name: string;
  fileName: string;
}

export interface WeatherData {
  temperature: number;
  weatherCode: number;
  dailyMax: number;
  dailyMin: number;
  precipitationProbability: number;
}

export interface AirQualityData {
  pm10: number;
  pm25: number;
}

export interface MealData {
  date: string;
  menu: string[];
  calories?: string;
}

export interface ScheduleEvent {
  date: string;
  name: string;
  detail?: string;
}

export interface TimetableData {
  headers: string[];
  periods: PeriodTime[];
  subjects: string[][];
}

export interface PeriodTime {
  period: number;
  start: string;
  end: string;
}

export interface StudyPlanBlock {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface StudyPlanResult {
  blocks: StudyPlanBlock[];
  currentIndex: number;
}

export interface DashboardData {
  weather: WeatherData | null;
  airQuality: AirQualityData | null;
  meals: MealData[];
  events: ScheduleEvent[];
  timetable: TimetableData | null;
  studyPlan: StudyPlanResult | null;
}

export interface SchoolInfo {
  schoolCode: string;
  officeCode: string;
  schoolName: string;
  address?: string;
}

export interface Coords {
  lat: number;
  lon: number;
}

export interface AlarmFileResult {
  data: string;
  name: string;
}

export interface BackgroundFileResult {
  id: string;
  name: string;
  fileName: string;
}

export type AirQualityLevel = "good" | "moderate" | "unhealthy" | "very-unhealthy";
