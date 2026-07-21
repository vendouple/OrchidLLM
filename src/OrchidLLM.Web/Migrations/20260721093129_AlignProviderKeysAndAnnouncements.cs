using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OrchidLLM.Web.Migrations
{
    /// <inheritdoc />
    public partial class AlignProviderKeysAndAnnouncements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BoosterPacks_SubscriptionTiers_PermanentBaseTierId",
                table: "BoosterPacks");

            migrationBuilder.DropTable(
                name: "UserDismissedAnnouncements");

            migrationBuilder.DropIndex(
                name: "IX_BoosterPacks_PermanentBaseTierId",
                table: "BoosterPacks");

            migrationBuilder.DropColumn(
                name: "ExpiresAt",
                table: "UserBoosterPacks");

            migrationBuilder.DropColumn(
                name: "EnvKeyPrefix",
                table: "Providers");

            migrationBuilder.DropColumn(
                name: "DurationDays",
                table: "BoosterPacks");

            migrationBuilder.DropColumn(
                name: "IsPermanent",
                table: "BoosterPacks");

            migrationBuilder.DropColumn(
                name: "PermanentBaseTierId",
                table: "BoosterPacks");

            // NOT a rename despite matching type/position — BannerExpiresAt ("when the banner
            // disappears") and LastEditedAt ("when an admin last edited this entry") are
            // unrelated fields. Drop the old one and add both new ones fresh so no existing
            // expiry data is silently reinterpreted as an edit timestamp.
            migrationBuilder.DropColumn(
                name: "BannerExpiresAt",
                table: "Announcements");

            migrationBuilder.AddColumn<string>(
                name: "BannerTitle",
                table: "Announcements",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<DateTime>(
                name: "ExpiresAt",
                table: "Announcements",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastEditedAt",
                table: "Announcements",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsBannerDismissible",
                table: "Announcements",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PostedAt",
                table: "Announcements",
                type: "datetime(6)",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.CreateTable(
                name: "ProviderKeys",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    ProviderId = table.Column<int>(type: "int", nullable: false),
                    KeyCipher = table.Column<string>(type: "longtext", nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    KeyPreview = table.Column<string>(type: "varchar(60)", maxLength: 60, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    RateLimitUntil = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    LastUsedAt = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProviderKeys", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProviderKeys_Providers_ProviderId",
                        column: x => x.ProviderId,
                        principalTable: "Providers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "UserDismissedBanners",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    AnnouncementId = table.Column<int>(type: "int", nullable: false),
                    DismissedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserDismissedBanners", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserDismissedBanners_Announcements_AnnouncementId",
                        column: x => x.AnnouncementId,
                        principalTable: "Announcements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserDismissedBanners_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "UserReadAnnouncements",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    AnnouncementId = table.Column<int>(type: "int", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserReadAnnouncements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserReadAnnouncements_Announcements_AnnouncementId",
                        column: x => x.AnnouncementId,
                        principalTable: "Announcements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserReadAnnouncements_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_ProviderKeys_ProviderId",
                table: "ProviderKeys",
                column: "ProviderId");

            migrationBuilder.CreateIndex(
                name: "IX_UserDismissedBanners_AnnouncementId",
                table: "UserDismissedBanners",
                column: "AnnouncementId");

            migrationBuilder.CreateIndex(
                name: "IX_UserDismissedBanners_UserId_AnnouncementId",
                table: "UserDismissedBanners",
                columns: new[] { "UserId", "AnnouncementId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserReadAnnouncements_AnnouncementId",
                table: "UserReadAnnouncements",
                column: "AnnouncementId");

            migrationBuilder.CreateIndex(
                name: "IX_UserReadAnnouncements_UserId_AnnouncementId",
                table: "UserReadAnnouncements",
                columns: new[] { "UserId", "AnnouncementId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProviderKeys");

            migrationBuilder.DropTable(
                name: "UserDismissedBanners");

            migrationBuilder.DropTable(
                name: "UserReadAnnouncements");

            migrationBuilder.DropColumn(
                name: "BannerTitle",
                table: "Announcements");

            migrationBuilder.DropColumn(
                name: "ExpiresAt",
                table: "Announcements");

            migrationBuilder.DropColumn(
                name: "LastEditedAt",
                table: "Announcements");

            migrationBuilder.DropColumn(
                name: "IsBannerDismissible",
                table: "Announcements");

            migrationBuilder.DropColumn(
                name: "PostedAt",
                table: "Announcements");

            migrationBuilder.AddColumn<DateTime>(
                name: "BannerExpiresAt",
                table: "Announcements",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ExpiresAt",
                table: "UserBoosterPacks",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EnvKeyPrefix",
                table: "Providers",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true)
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "DurationDays",
                table: "BoosterPacks",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "IsPermanent",
                table: "BoosterPacks",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "PermanentBaseTierId",
                table: "BoosterPacks",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "UserDismissedAnnouncements",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    AnnouncementId = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<int>(type: "int", nullable: false),
                    DismissedAt = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserDismissedAnnouncements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserDismissedAnnouncements_Announcements_AnnouncementId",
                        column: x => x.AnnouncementId,
                        principalTable: "Announcements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_UserDismissedAnnouncements_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_BoosterPacks_PermanentBaseTierId",
                table: "BoosterPacks",
                column: "PermanentBaseTierId");

            migrationBuilder.CreateIndex(
                name: "IX_UserDismissedAnnouncements_AnnouncementId",
                table: "UserDismissedAnnouncements",
                column: "AnnouncementId");

            migrationBuilder.CreateIndex(
                name: "IX_UserDismissedAnnouncements_UserId_AnnouncementId",
                table: "UserDismissedAnnouncements",
                columns: new[] { "UserId", "AnnouncementId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_BoosterPacks_SubscriptionTiers_PermanentBaseTierId",
                table: "BoosterPacks",
                column: "PermanentBaseTierId",
                principalTable: "SubscriptionTiers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
