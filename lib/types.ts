import type { Database } from "@/lib/database.types";

type Public = Database["public"];
type Tables = Public["Tables"];
type Views = Public["Views"];

export type Enums = Public["Enums"];
export type UserRole = Enums["user_role"];
export type ZoneType = Enums["zone_type"];
export type ZoneStatus = Enums["zone_status"];
export type CatchSource = Enums["catch_source"];
export type CatchStatus = Enums["catch_status"];
export type ReportType = Enums["report_type"];
export type ReportStatus = Enums["report_status"];
export type ReefCondition = Enums["reef_condition"];

export type Profile = Tables["profiles"]["Row"];
export type Boat = Tables["boats"]["Row"];
export type Species = Tables["species"]["Row"];
export type Zone = Tables["zones"]["Row"];
export type Catch = Tables["catches"]["Row"];
export type CatchInsert = Tables["catches"]["Insert"];
export type Report = Tables["reports"]["Row"];
export type GalleryItem = Tables["spots_gallery"]["Row"];

// Read views: geography exposed as lat/lng or GeoJSON.
export type ZoneWithGeoJson = Views["zones_geojson"]["Row"];
export type CatchDetail = Views["catch_details"]["Row"];
export type ReportDetail = Views["report_details"]["Row"];
export type GalleryDetail = Views["gallery_details"]["Row"];

export { Constants } from "@/lib/database.types";
