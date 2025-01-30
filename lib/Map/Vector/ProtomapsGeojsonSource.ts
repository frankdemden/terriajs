import Point from "@mapbox/point-geometry";
import geojsonvt, { FeatureTypes } from "geojson-vt";
import { makeObservable, observable, runInAction } from "mobx";
import {
  Bbox,
  GeomType,
  Feature as ProtomapsFeature,
  TileSource,
  Zxy
} from "protomaps-leaflet";
import {
  FeatureCollectionWithCrs,
  toFeatureCollection
} from "../../ModelMixins/GeojsonMixin";
import {
  PROTOMAPS_DEFAULT_TILE_SIZE,
  PROTOMAPS_TILE_BUFFER
} from "../ImageryProvider/ProtomapsImageryProvider";
import { featureCollection } from "@turf/helpers";

/** Extent (of coordinates) of tiles generated by geojson-vt */
const GEOJSON_VT_EXTENT = 4096;

/** Layer name to use with geojson-vt
 *  This must be used in PaintRules/LabelRules (eg `dataLayer: "layer"`)
 */
export const GEOJSON_SOURCE_LAYER_NAME = "layer";

/** Protomaps Geojson source
 * This source uses geojson-vt to tile geojson data
 * It is designed to be used with ProtomapsImageryProvider
 */
export class ProtomapsGeojsonSource implements TileSource {
  /** Data object from Options */
  private readonly data: string | FeatureCollectionWithCrs;

  /** Resolved geojsonObject (if applicable) */
  @observable.ref
  geojsonObject: FeatureCollectionWithCrs | undefined;

  /** Geojson-vt tileIndex (if applicable) */
  tileIndex: Promise<ReturnType<typeof geojsonvt>> | undefined;

  constructor(url: string | FeatureCollectionWithCrs) {
    makeObservable(this);
    this.data = url;
    if (typeof url !== "string") {
      this.geojsonObject = url;
    }
  }

  /** Fetch geoJSON data (if required) and tile with geojson-vt */
  private async fetchData() {
    let result: FeatureCollectionWithCrs;
    if (typeof this.data === "string") {
      result =
        toFeatureCollection(await (await fetch(this.data)).json()) ??
        featureCollection([]);
    } else {
      result = this.data;
    }

    runInAction(() => (this.geojsonObject = result));

    return geojsonvt(result as geojsonvt.Data, {
      buffer:
        (PROTOMAPS_TILE_BUFFER / PROTOMAPS_DEFAULT_TILE_SIZE) *
        GEOJSON_VT_EXTENT,
      extent: GEOJSON_VT_EXTENT,
      maxZoom: 24
    });
  }

  public async get(
    c: Zxy,
    tileSize: number
  ): Promise<Map<string, ProtomapsFeature[]>> {
    if (!this.tileIndex) {
      this.tileIndex = this.fetchData();
    }

    // request a particular tile
    const tile = (await this.tileIndex).getTile(c.z, c.x, c.y);
    const result = new Map<string, ProtomapsFeature[]>();
    const scale = tileSize / GEOJSON_VT_EXTENT;

    if (tile && tile.features && tile.features.length > 0) {
      result.set(
        GEOJSON_SOURCE_LAYER_NAME,

        // We have to transform feature objects from GeojsonVtTile to ProtomapsFeature
        tile.features
          .map((f) => {
            let transformedGeom: Point[][] = [];
            let numVertices = 0;

            // Calculate bbox
            const bbox: Bbox = {
              minX: Infinity,
              minY: Infinity,
              maxX: -Infinity,
              maxY: -Infinity
            };

            const geom = f.geometry;
            transformedGeom = [
              geom.map((g1) => {
                g1 = [g1[0] * scale, g1[1] * scale];

                if (bbox.minX > g1[0]) {
                  bbox.minX = g1[0];
                }

                if (bbox.maxX < g1[0]) {
                  bbox.maxX = g1[0];
                }

                if (bbox.minY > g1[1]) {
                  bbox.minY = g1[1];
                }

                if (bbox.maxY < g1[1]) {
                  bbox.maxY = g1[1];
                }
                return new Point(g1[0], g1[1]);
              })
            ];
            numVertices = transformedGeom.length;

            if (f.type === FeatureTypes.Unknown) return null;

            const geomType = {
              [FeatureTypes.Point]: GeomType.Point,
              [FeatureTypes.Linestring]: GeomType.Line,
              [FeatureTypes.Polygon]: GeomType.Polygon
            }[f.type];

            const feature: ProtomapsFeature = {
              props: { ...(f.tags ?? {}) },
              bbox,
              geomType,
              geom: transformedGeom,
              numVertices
            };

            return feature;
          })
          .filter((f) => f !== null) as ProtomapsFeature[]
      );
    }

    return result;
  }
}
