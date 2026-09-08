/// <reference types="node" />
/**
 * Main Process Backward Compatibility Adapter - PE Resource Decoder
 *
 * Delegates PE .rsrc decoding and metadata extraction to @yumeshelf/engine.
 */

import {
  PeResourceDecoder as EnginePeResourceDecoder,
  extractPeIcon as engineExtractPeIcon,
  extractPeMetadata as engineExtractPeMetadata,
  type ExtractedPeIcon,
  type PeVersionMetadata,
  type PeResourceDecoderOptions,
  type PeResourceSection
} from '@yumeshelf/engine';

export type { ExtractedPeIcon, PeVersionMetadata, PeResourceDecoderOptions, PeResourceSection };
export {
  EnginePeResourceDecoder as PeResourceDecoder,
  engineExtractPeIcon as extractPeIcon,
  engineExtractPeMetadata as extractPeMetadata
};
