import { ApiProperty } from '@nestjs/swagger';
import { ExportType } from '../entities/video.entity';

export class CreateVideoDto {
  @ApiProperty()
  type: ExportType;

  @ApiProperty()
  html?: string;

  @ApiProperty()
  json?: string;

  @ApiProperty()
  frameNumber?: number;
}
