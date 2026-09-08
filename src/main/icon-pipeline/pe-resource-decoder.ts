/// <reference types="node" />
/**
 * Main Process Backward Compatibility Adapter - PE Resource Decoder
 *
 * Delegates PE .rsrc decoding and metadata extraction to @yumeshelf/engine.
 */

export {
  PeResourceDecoder,
  extractPeIcon,
  extractPeMetadata,
  type ExtractedPeIcon,
  type PeVersionMetadata,
  type PeResourceDecoderOptions,
  type PeResourceSection
} from '@yumeshelf/engine';
