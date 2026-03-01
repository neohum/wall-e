export namespace main {
	
	export class AirQualityData {
	    pm10: number;
	    pm25: number;
	
	    static createFrom(source: any = {}) {
	        return new AirQualityData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pm10 = source["pm10"];
	        this.pm25 = source["pm25"];
	    }
	}
	export class AlarmFileResult {
	    data: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new AlarmFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.data = source["data"];
	        this.name = source["name"];
	    }
	}
	export class BackgroundFileResult {
	    id: string;
	    name: string;
	    fileName: string;
	
	    static createFrom(source: any = {}) {
	        return new BackgroundFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.fileName = source["fileName"];
	    }
	}
	export class Coords {
	    lat: number;
	    lon: number;
	
	    static createFrom(source: any = {}) {
	        return new Coords(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lat = source["lat"];
	        this.lon = source["lon"];
	    }
	}
	export class CustomBackground {
	    id: string;
	    name: string;
	    fileName: string;
	
	    static createFrom(source: any = {}) {
	        return new CustomBackground(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.fileName = source["fileName"];
	    }
	}
	export class StudyPlanBlock {
	    title: string;
	    headers: string[];
	    rows: string[][];
	
	    static createFrom(source: any = {}) {
	        return new StudyPlanBlock(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.headers = source["headers"];
	        this.rows = source["rows"];
	    }
	}
	export class StudyPlanResult {
	    blocks: StudyPlanBlock[];
	    currentIndex: number;
	
	    static createFrom(source: any = {}) {
	        return new StudyPlanResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.blocks = this.convertValues(source["blocks"], StudyPlanBlock);
	        this.currentIndex = source["currentIndex"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PeriodTime {
	    period: number;
	    start: string;
	    end: string;
	
	    static createFrom(source: any = {}) {
	        return new PeriodTime(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.period = source["period"];
	        this.start = source["start"];
	        this.end = source["end"];
	    }
	}
	export class TimetableData {
	    headers: string[];
	    periods: PeriodTime[];
	    subjects: string[][];
	
	    static createFrom(source: any = {}) {
	        return new TimetableData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.headers = source["headers"];
	        this.periods = this.convertValues(source["periods"], PeriodTime);
	        this.subjects = source["subjects"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ScheduleEvent {
	    date: string;
	    name: string;
	    detail?: string;
	
	    static createFrom(source: any = {}) {
	        return new ScheduleEvent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.name = source["name"];
	        this.detail = source["detail"];
	    }
	}
	export class MealData {
	    date: string;
	    menu: string[];
	    calories?: string;
	
	    static createFrom(source: any = {}) {
	        return new MealData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.menu = source["menu"];
	        this.calories = source["calories"];
	    }
	}
	export class WeatherData {
	    temperature: number;
	    weatherCode: number;
	    dailyMax: number;
	    dailyMin: number;
	    precipitationProbability: number;
	
	    static createFrom(source: any = {}) {
	        return new WeatherData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.temperature = source["temperature"];
	        this.weatherCode = source["weatherCode"];
	        this.dailyMax = source["dailyMax"];
	        this.dailyMin = source["dailyMin"];
	        this.precipitationProbability = source["precipitationProbability"];
	    }
	}
	export class DashboardData {
	    weather?: WeatherData;
	    airQuality?: AirQualityData;
	    meals: MealData[];
	    events: ScheduleEvent[];
	    timetable?: TimetableData;
	    studyPlan?: StudyPlanResult;
	
	    static createFrom(source: any = {}) {
	        return new DashboardData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.weather = this.convertValues(source["weather"], WeatherData);
	        this.airQuality = this.convertValues(source["airQuality"], AirQualityData);
	        this.meals = this.convertValues(source["meals"], MealData);
	        this.events = this.convertValues(source["events"], ScheduleEvent);
	        this.timetable = this.convertValues(source["timetable"], TimetableData);
	        this.studyPlan = this.convertValues(source["studyPlan"], StudyPlanResult);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class SchoolInfo {
	    schoolCode: string;
	    officeCode: string;
	    schoolName: string;
	    address?: string;
	
	    static createFrom(source: any = {}) {
	        return new SchoolInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schoolCode = source["schoolCode"];
	        this.officeCode = source["officeCode"];
	        this.schoolName = source["schoolName"];
	        this.address = source["address"];
	    }
	}
	export class SchoolSearchResult {
	    schools: SchoolInfo[];
	    error: string;

	    static createFrom(source: any = {}) {
	        return new SchoolSearchResult(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schools = this.convertValues(source["schools"], SchoolInfo);
	        this.error = source["error"];
	    }

		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Settings {
	    schoolName: string;
	    schoolCode: string;
	    officeCode: string;
	    grade: number;
	    classNum: number;
	    latitude: number;
	    longitude: number;
	    spreadsheetUrl: string;
	    useCustomApiKey: boolean;
	    customApiKey: string;
	    alarmEnabled: boolean;
	    alarmSound: string;
	    customAlarmData: string;
	    customAlarmName: string;
	    backgroundId: string;
	    customBackgrounds: CustomBackground[];

	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }

	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schoolName = source["schoolName"];
	        this.schoolCode = source["schoolCode"];
	        this.officeCode = source["officeCode"];
	        this.grade = source["grade"];
	        this.classNum = source["classNum"];
	        this.latitude = source["latitude"];
	        this.longitude = source["longitude"];
	        this.spreadsheetUrl = source["spreadsheetUrl"];
	        this.useCustomApiKey = source["useCustomApiKey"];
	        this.customApiKey = source["customApiKey"];
	        this.alarmEnabled = source["alarmEnabled"];
	        this.alarmSound = source["alarmSound"];
	        this.customAlarmData = source["customAlarmData"];
	        this.customAlarmName = source["customAlarmName"];
	        this.backgroundId = source["backgroundId"];
	        this.customBackgrounds = this.convertValues(source["customBackgrounds"], CustomBackground);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class UpdateCheckResult {
	    updateAvailable: boolean;
	    currentVersion: string;
	    latestVersion: string;
	    downloadURL: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateCheckResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.updateAvailable = source["updateAvailable"];
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.downloadURL = source["downloadURL"];
	        this.error = source["error"];
	    }
	}

}

