import AbstractConstructor from "../Core/AbstractConstructor";
import Model from "../Models/Definition/Model";
import CatalogMemberTraits from "../Traits/TraitsClasses/CatalogMemberTraits";
import CesiumIonTraits from "../Traits/TraitsClasses/CesiumIonTraits";
import CatalogMemberMixin from "./CatalogMemberMixin";
import { makeObservable, observable, runInAction } from "mobx";
import IonResource from "terriajs-cesium/Source/Core/IonResource";

type BaseType = Model<CesiumIonTraits & CatalogMemberTraits>;

export default function CesiumIonMixin<T extends AbstractConstructor<BaseType>>(
  Base: T
) {
  abstract class CesiumIonMixin extends Base {
    @observable
    ionResource: IonResource | undefined = undefined;

    /**
     * Populates the the `ionResource` from the `ionAssetId`, `ionAccessToken`, and `ionServer`
     * traits. This should be called from `forceLoadMetadata`.
     */
    async loadIonResource(): Promise<void> {
      if (this.ionAssetId) {
        const resource = await IonResource.fromAssetId(this.ionAssetId, {
          accessToken: this.ionAccessToken,
          server: this.ionServer
        });

        runInAction(() => {
          this.ionResource = resource;
        });
      } else {
        this.ionResource = undefined;
      }
    }
  }

  return CesiumIonMixin;
}
