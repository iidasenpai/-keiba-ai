// 比較候補の指定。予想・学習・保存データは変更しない。
export type VenueCandidate = 'Recent' | 'Balanced' | null;
export const VENUE_CANDIDATES: Record<string, VenueCandidate> = {
 '浦和':'Recent','盛岡':'Recent','佐賀':'Recent','名古屋':'Recent',
 '門別':'Balanced','園田':'Balanced',
 '大井':null,'高知':null,'笠松':null,'金沢':null,'水沢':null,
 '船橋':null,'川崎':null,'姫路':null,'帯広':null,
};
export function venueCandidate(track:string):VenueCandidate {
 return Object.prototype.hasOwnProperty.call(VENUE_CANDIDATES,track)?VENUE_CANDIDATES[track]:null;
}
