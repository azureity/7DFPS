#pragma strict


enum GunType {AUTOMATIC, REVOLVER};
var gun_type : GunType;

var sound_gunshot_bigroom : AudioClip[];
var sound_gunshot_smallroom : AudioClip[];
var sound_gunshot_open : AudioClip[];
var sound_mag_eject_button : AudioClip[];
var sound_mag_ejection : AudioClip[];
var sound_mag_insertion : AudioClip[];
var sound_slide_back : AudioClip[];
var sound_slide_front : AudioClip[];
var sound_safety : AudioClip[];
var sound_bullet_eject : AudioClip[];

private var kGunMechanicVolume = 0.2;

var add_head_recoil = false;
var recoil_transfer_x = 0.0;
var recoil_transfer_y = 0.0;
var rotation_transfer_x = 0.0;
var rotation_transfer_y = 0.0;

var old_pos : Vector3;
var velocity : Vector3;

var magazine_obj:GameObject;

var bullet_obj:GameObject;
var muzzle_flash:GameObject;

var shell_casing:GameObject;
var casing_with_bullet:GameObject;
var ready_to_remove_mag = false;

enum PressureState {NONE, INITIAL, CONTINUING};
var pressure_on_trigger = PressureState.NONE;

private var round_in_chamber:GameObject;
enum RoundState {EMPTY, READY, FIRED, LOADING, JAMMED};
private var round_in_chamber_state = RoundState.READY;

private var magazine_instance_in_gun:GameObject;
private var mag_offset = 0.0;

private var slide_rel_pos : Vector3;
private var slide_amount = 0.0;
private var slide_lock = false;
enum SlideStage {NOTHING, PULLBACK, HOLD};
private var slide_stage : SlideStage = SlideStage.NOTHING;

enum Thumb{ON_HAMMER, OFF_HAMMER, SLOW_LOWERING};
private var thumb_on_hammer = Thumb.OFF_HAMMER;
private var hammer_rel_pos : Vector3;
private var hammer_rel_rot : Quaternion;
private var hammer_cocked = 1.0;

private var safety_rel_pos : Vector3;
private var safety_rel_rot : Quaternion;

private var safety_off = 1.0;
enum Safety{OFF, ON};
private var safety = Safety.OFF;

private var kSlideLockPosition = 0.8;
private var kSlideLockSpeed = 20.0;

enum MagStage {OUT, INSERTING, IN, REMOVING};
private var mag_stage : MagStage = MagStage.IN;
private var mag_seated = 1.0;

private var has_slide = false;
private var has_safety = false;

private var yolk_pivot_rel_rot : Quaternion;
private var yolk_open = 0.0;
enum YolkStage {CLOSED, OPENING, OPEN, CLOSING};
private var yolk_stage : YolkStage = YolkStage.CLOSED;
private var cylinder_rotation = 0.0;
private var last_cylinder_rotation = 0.0;
enum ExtractorRodStage {CLOSED, OPENING, OPEN, CLOSING};
private var extractor_rod_stage = ExtractorRodStage.CLOSED;
private var extractor_rod_amount = 0.0;
private var extractor_rod_rel_pos : Vector3;
private var cylinder_bullets : GameObject[];
private var cylinder_capacity = 6;

function Start () {
	if(transform.FindChild("slide")){
		has_slide = true;
		slide_rel_pos = transform.FindChild("slide").localPosition;
	}
	hammer_rel_pos = transform.FindChild("hammer").localPosition;
	hammer_rel_rot = transform.FindChild("hammer").localRotation;
	var yolk_pivot = transform.FindChild("yolk_pivot");
	if(yolk_pivot){
		yolk_pivot_rel_rot = yolk_pivot.localRotation;
		var yolk = yolk_pivot.FindChild("yolk");
		if(yolk){
			var cylinder_assembly = yolk.FindChild("cylinder_assembly");
			if(cylinder_assembly){
				var extractor_rod = cylinder_assembly.FindChild("extractor_rod");
				if(extractor_rod){
					extractor_rod_rel_pos = extractor_rod.localPosition;
				}
			}
		}
	}
	
	if(transform.FindChild("safety")){
		has_safety = true;
		safety_rel_pos = transform.FindChild("safety").localPosition;
		safety_rel_rot = transform.FindChild("safety").localRotation;
		if(Random.Range(0,2) == 0){
			safety_off = 0.0;
			safety = Safety.ON;
		}
	}
	if(gun_type == GunType.AUTOMATIC){
		magazine_instance_in_gun = Instantiate(magazine_obj);
		magazine_instance_in_gun.transform.parent = transform;
	
		var renderers = magazine_instance_in_gun.GetComponentsInChildren(Renderer);
		for(var renderer : Renderer in renderers){
			renderer.castShadows = false; 
		}
		
		if(Random.Range(0,2) == 0){
			round_in_chamber = Instantiate(casing_with_bullet, transform.FindChild("point_chambered_round").position, transform.FindChild("point_chambered_round").rotation);
			round_in_chamber.transform.parent = transform;
			round_in_chamber.transform.localScale = Vector3(1.0,1.0,1.0);
			renderers = round_in_chamber.GetComponentsInChildren(Renderer);
			for(var renderer : Renderer in renderers){
				renderer.castShadows = false; 
			}
		}
		
		if(Random.Range(0,2) == 0){
			slide_amount = kSlideLockPosition;
			slide_lock = true;
		}
	}
	
	if(gun_type == GunType.REVOLVER){
		cylinder_bullets = new GameObject[cylinder_capacity];
		for(var i=0; i<cylinder_capacity; ++i){
			var name = "point_chamber_"+(i+1);
			cylinder_bullets[i] = Instantiate(casing_with_bullet, extractor_rod.FindChild(name).position, extractor_rod.FindChild(name).rotation);
			cylinder_bullets[i].transform.localScale = Vector3(1.0,1.0,1.0);
			renderers = cylinder_bullets[i].GetComponentsInChildren(Renderer);
			for(var renderer : Renderer in renderers){
				renderer.castShadows = false; 
			}
		}
	}
	
	if(Random.Range(0,2) == 0){
		hammer_cocked = 0.0;
	}
}

function MagScript() : mag_script {
	return magazine_instance_in_gun.GetComponent("mag_script");
}

function ShouldPullSlide() {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	return (!round_in_chamber && magazine_instance_in_gun && magazine_instance_in_gun.GetComponent(mag_script).NumRounds()>0);
}

function ShouldReleaseSlideLock() {
	return (round_in_chamber && slide_lock);
}

function ShouldEjectMag() {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	return (magazine_instance_in_gun && magazine_instance_in_gun.GetComponent(mag_script).NumRounds() == 0);
}

function ChamberRoundFromMag() : boolean {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	if(magazine_instance_in_gun && MagScript().NumRounds() > 0 && mag_stage == MagStage.IN){
		if(!round_in_chamber){
			MagScript().RemoveRound();
			round_in_chamber = Instantiate(casing_with_bullet, transform.FindChild("point_load_round").position, transform.FindChild("point_load_round").rotation);
			var renderers = round_in_chamber.GetComponentsInChildren(Renderer);
			for(var renderer : Renderer in renderers){
				renderer.castShadows = false; 
			}
			round_in_chamber.transform.parent = transform;
			round_in_chamber.transform.localScale = Vector3(1.0,1.0,1.0);
			round_in_chamber_state = RoundState.LOADING;
		}
		return true;
	} else {
		return false;
	}
}

function PullSlideBack() {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	slide_amount = 1.0;
	if(slide_lock && mag_stage == MagStage.IN && (!magazine_instance_in_gun || MagScript().NumRounds() == 0)){
		return;
	}
	slide_lock = false;
	if(round_in_chamber && (round_in_chamber_state == RoundState.FIRED || round_in_chamber_state == RoundState.READY)){
		round_in_chamber.AddComponent(Rigidbody);
		PlaySoundFromGroup(sound_bullet_eject, kGunMechanicVolume);
		round_in_chamber.transform.parent = null;
		round_in_chamber.rigidbody.interpolation = RigidbodyInterpolation.Interpolate;
		round_in_chamber.rigidbody.velocity = velocity;
		round_in_chamber.rigidbody.velocity += transform.rotation * Vector3(Random.Range(2.0,4.0),Random.Range(1.0,2.0),Random.Range(-1.0,-3.0));
		round_in_chamber.rigidbody.angularVelocity = Vector3(Random.Range(-40.0,40.0),Random.Range(-40.0,40.0),Random.Range(-40.0,40.0));
		round_in_chamber = null;
	}
	if(!ChamberRoundFromMag() && mag_stage == MagStage.IN){
		slide_lock = true;
	}
}

function ReleaseSlideLock() {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	slide_lock = false;
}

function mix( a:Vector3, b:Vector3, val:float ) : Vector3{
	return a + (b-a) * val;
}

function mix( a:Quaternion, b:Quaternion, val:float ) : Quaternion{
	var angle = 0.0;
	var axis = Vector3();
	(Quaternion.Inverse(b)*a).ToAngleAxis(angle, axis);
	if(angle > 180){
		angle -= 360;
	}
	if(angle < -180){
		angle += 360;
	}
	return a * Quaternion.AngleAxis(angle * -val, axis);
}

function PlaySoundFromGroup(group : Array, volume : float){
	if(group.length == 0){
		return;
	}
	var which_shot = Random.Range(0,group.length);
	audio.PlayOneShot(group[which_shot], volume * PlayerPrefs.GetFloat("sound_volume", 1.0));
}


function ApplyPressureToTrigger() : boolean {
	if(pressure_on_trigger == PressureState.NONE){
		pressure_on_trigger = PressureState.INITIAL;
	} else {
		pressure_on_trigger = PressureState.CONTINUING;
	}
	if(pressure_on_trigger == PressureState.INITIAL && !slide_lock && thumb_on_hammer == Thumb.OFF_HAMMER && hammer_cocked == 1.0 && safety_off == 1.0){
		hammer_cocked = 0.0;
		if(round_in_chamber && slide_amount == 0.0 && round_in_chamber_state == RoundState.READY){
			PlaySoundFromGroup(sound_gunshot_smallroom, 1.0);
			round_in_chamber_state = RoundState.FIRED;
			GameObject.Destroy(round_in_chamber);
			round_in_chamber = Instantiate(shell_casing, transform.FindChild("point_chambered_round").position, transform.rotation);
			round_in_chamber.transform.parent = transform;
			var renderers = round_in_chamber.GetComponentsInChildren(Renderer);
			for(var renderer : Renderer in renderers){
				renderer.castShadows = false; 
			}
			
			Instantiate(muzzle_flash, transform.FindChild("point_muzzleflash").position, transform.FindChild("point_muzzleflash").rotation);
			var bullet = Instantiate(bullet_obj, transform.FindChild("point_muzzle").position, transform.FindChild("point_muzzle").rotation);
			bullet.GetComponent(BulletScript).SetVelocity(transform.forward * 251.0);
			PullSlideBack();
			rotation_transfer_y += Random.Range(1.0,2.0);
			rotation_transfer_x += Random.Range(-1.0,1.0);
			recoil_transfer_x -= Random.Range(150.0,300.0);
			recoil_transfer_y += Random.Range(-200.0,200.0);
			add_head_recoil = true;
			return true;
		} else {
			PlaySoundFromGroup(sound_mag_eject_button, 0.5);
		}
	}
	return false;
}

function ReleasePressureFromTrigger() {
	pressure_on_trigger = PressureState.NONE;
}

function MagEject() : boolean {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	PlaySoundFromGroup(sound_mag_eject_button, kGunMechanicVolume);
	if(mag_stage != MagStage.OUT){
		mag_stage = MagStage.REMOVING;
		PlaySoundFromGroup(sound_mag_ejection, kGunMechanicVolume);
		return true;
	}
	return false;
}

function TryToReleaseSlideLock() {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	if(slide_amount == kSlideLockPosition){
		ReleaseSlideLock();
	}
}

function PressureOnSlideLock() {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	if(slide_amount > kSlideLockPosition){
		slide_lock = true;
	}
}

function ToggleSafety() {
	if(!has_safety){
		return false;
	}
	PlaySoundFromGroup(sound_safety, kGunMechanicVolume);
	if(safety == Safety.OFF){
		safety = Safety.ON;
	} else if(safety == Safety.ON){
		safety = Safety.OFF;
	}
}

function PullBackSlide() {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	if(slide_stage == SlideStage.NOTHING){
		slide_stage = SlideStage.PULLBACK;
		slide_lock = false;
	}
}

function ReleaseSlide() {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	slide_stage = SlideStage.NOTHING;
}

function PressureOnHammer() {
	thumb_on_hammer = Thumb.ON_HAMMER;
	var old_hammer_cocked = hammer_cocked;
	hammer_cocked = Mathf.Min(1.0, hammer_cocked + Time.deltaTime * 10.0f);
	if(hammer_cocked == 1.0 && old_hammer_cocked != 1.0){
		PlaySoundFromGroup(sound_safety, kGunMechanicVolume);
	}
	cylinder_rotation = last_cylinder_rotation + hammer_cocked * 360/6;
}

function ReleaseHammer() {
	if((pressure_on_trigger != PressureState.NONE && safety_off == 1.0) || hammer_cocked != 1.0){
		thumb_on_hammer = Thumb.SLOW_LOWERING;
	} else {
		thumb_on_hammer = Thumb.OFF_HAMMER;
	}
}

function IsSafetyOn() : boolean {
	return (safety == Safety.ON);
}

function IsSlideLocked() : boolean {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	return (slide_lock);
}

function IsSlidePulledBack() : boolean {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	return (slide_stage != SlideStage.NOTHING);
}

function RemoveMag() : GameObject {
	if(gun_type != GunType.AUTOMATIC){
		return null;
	}
	var mag = magazine_instance_in_gun;
	magazine_instance_in_gun = null;
	mag.transform.parent = null;
	ready_to_remove_mag = false;
	return mag;
}

function IsThereAMagInGun() : boolean {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	return magazine_instance_in_gun;
}

function IsMagCurrentlyEjecting() : boolean {
	if(gun_type != GunType.AUTOMATIC){
		return false;
	}
	return mag_stage == MagStage.REMOVING;
}

function InsertMag(mag : GameObject) {
	if(gun_type != GunType.AUTOMATIC){
		return;
	}
	if(magazine_instance_in_gun){
		return;
	}
	magazine_instance_in_gun = mag;
	mag.transform.parent = transform;
	mag_stage = MagStage.INSERTING;
	PlaySoundFromGroup(sound_mag_insertion, kGunMechanicVolume);
	mag_seated = 0.0;
}

function IsHammerCocked() : boolean {
	return hammer_cocked == 1.0;
}

function SwingOutCylinder() : boolean {
	if(gun_type == GunType.REVOLVER && (yolk_stage == YolkStage.CLOSED || yolk_stage == YolkStage.CLOSING)){
		yolk_stage = YolkStage.OPENING;
		return true;
	} else {
		return false;
	}
}

function CloseCylinder() : boolean {
	if(gun_type == GunType.REVOLVER && (extractor_rod_stage == ExtractorRodStage.CLOSED && yolk_stage == YolkStage.OPEN || yolk_stage == YolkStage.OPENING)){
		yolk_stage = YolkStage.CLOSING;
		return true;
	} else {
		return false;
	}
}

function ExtractorRod() : boolean {
	if(gun_type == GunType.REVOLVER && (yolk_stage == YolkStage.OPEN && extractor_rod_stage == ExtractorRodStage.CLOSED || extractor_rod_stage == ExtractorRodStage.CLOSING)){
		extractor_rod_stage = ExtractorRodStage.OPENING;
		return true;
	} else {
		return false;
	}
}

function Update () {
	if(gun_type == GunType.AUTOMATIC){
		if(magazine_instance_in_gun){
			var mag_pos = transform.position;
			var mag_rot = transform.rotation;
			mag_pos += (transform.FindChild("point_mag_to_insert").position - 
					    transform.FindChild("point_mag_inserted").position) * 
					   (1.0 - mag_seated);
		   magazine_instance_in_gun.transform.position = mag_pos;
		   magazine_instance_in_gun.transform.rotation = mag_rot;
		}
		
		if(mag_stage == MagStage.INSERTING){
			mag_seated += Time.deltaTime * 5.0;
			if(mag_seated >= 1.0){
				mag_seated = 1.0;
				mag_stage = MagStage.IN;
				if(slide_amount > 0.7){
					ChamberRoundFromMag();
				}
				recoil_transfer_y += Random.Range(-40.0,40.0);
				recoil_transfer_x += Random.Range(50.0,300.0);
				rotation_transfer_x += Random.Range(-0.4,0.4);
				rotation_transfer_y += Random.Range(0.0,1.0);
			}
		}
		if(mag_stage == MagStage.REMOVING){
			mag_seated -= Time.deltaTime * 5.0;
			if(mag_seated <= 0.0){
				mag_seated = 0.0;
				ready_to_remove_mag = true;
				mag_stage = MagStage.OUT;
			}
		}
	}
	
	if(has_safety){
		if(safety == Safety.OFF){
			safety_off = Mathf.Min(1.0, safety_off + Time.deltaTime * 10.0);
		} else if(safety == Safety.ON){
			safety_off = Mathf.Max(0.0, safety_off - Time.deltaTime * 10.0);
		}
	}
	
	if(thumb_on_hammer == Thumb.SLOW_LOWERING){
		hammer_cocked -= Time.deltaTime * 10.0f;
		if(hammer_cocked <= 0.0){
			hammer_cocked = 0.0;
			thumb_on_hammer = Thumb.OFF_HAMMER;
			PlaySoundFromGroup(sound_mag_eject_button, kGunMechanicVolume);
		}
	}
	
	if(has_slide){
		if(slide_stage == SlideStage.PULLBACK || slide_stage == SlideStage.HOLD){
			if(slide_stage == SlideStage.PULLBACK){
				slide_amount += Time.deltaTime * 10.0;
				if(slide_amount >= kSlideLockPosition && slide_lock){
					slide_amount = kSlideLockPosition;
					slide_stage = SlideStage.HOLD;
					PlaySoundFromGroup(sound_slide_back, kGunMechanicVolume);
				}
				if(slide_amount >= 1.0){
					PullSlideBack();
					slide_amount = 1.0;
					slide_stage = SlideStage.HOLD;
					PlaySoundFromGroup(sound_slide_back, kGunMechanicVolume);
				}
			}
		}	
		
		transform.FindChild("slide").localPosition = 
			slide_rel_pos + 
			(transform.FindChild("point_slide_end").localPosition - 
			 transform.FindChild("point_slide_start").localPosition) * slide_amount;
	}
	
	transform.FindChild("hammer").localPosition = 
		Vector3.Lerp(hammer_rel_pos, transform.FindChild("point_hammer_cocked").localPosition, hammer_cocked);
	transform.FindChild("hammer").localRotation = 
		Quaternion.Slerp(hammer_rel_rot, transform.FindChild("point_hammer_cocked").localRotation, hammer_cocked);
	
	if(has_safety){
		transform.FindChild("safety").localPosition = 
			Vector3.Lerp(safety_rel_pos, transform.FindChild("point_safety_off").localPosition, safety_off);
		transform.FindChild("safety").localRotation = 
			Quaternion.Slerp(safety_rel_rot, transform.FindChild("point_safety_off").localRotation, safety_off);
	}
			
	hammer_cocked = Mathf.Max(hammer_cocked, slide_amount);
	if(hammer_cocked != 1.0 && thumb_on_hammer == Thumb.OFF_HAMMER){
		hammer_cocked = Mathf.Min(hammer_cocked, slide_amount);
	}

	if(has_slide){
		if(slide_stage == SlideStage.NOTHING){
			var old_slide_amount = slide_amount;
			slide_amount = Mathf.Max(0.0, slide_amount - Time.deltaTime * kSlideLockSpeed);
			if(!slide_lock && slide_amount == 0.0 && old_slide_amount != 0.0){
				PlaySoundFromGroup(sound_slide_front, kGunMechanicVolume*1.5);
				if(round_in_chamber){
					round_in_chamber.transform.position = transform.FindChild("point_chambered_round").position;
					round_in_chamber.transform.rotation = transform.FindChild("point_chambered_round").rotation;
				}
			}
			if(slide_amount == 0.0 && round_in_chamber_state == RoundState.LOADING){
				round_in_chamber_state = RoundState.READY;
			}
			if(slide_lock){
				slide_amount = Mathf.Max(kSlideLockPosition, slide_amount);
				if(old_slide_amount != kSlideLockPosition && slide_amount == kSlideLockPosition){
					PlaySoundFromGroup(sound_slide_front, kGunMechanicVolume);
				}
			}
		}
	}
	
	if(gun_type == GunType.REVOLVER){
		if(yolk_stage == YolkStage.CLOSING){
			yolk_open -= Time.deltaTime * 5.0;
			if(yolk_open <= 0.0){
				yolk_open = 0.0;
				yolk_stage = YolkStage.CLOSED;
			}
		}
		if(yolk_stage == YolkStage.OPENING){
			yolk_open += Time.deltaTime * 5.0;
			if(yolk_open >= 1.0){
				yolk_open = 1.0;
				yolk_stage = YolkStage.OPEN;
			}
		}
		if(extractor_rod_stage == ExtractorRodStage.CLOSING){
			extractor_rod_amount -= Time.deltaTime * 10.0;
			if(extractor_rod_amount <= 0.0){
				extractor_rod_amount = 0.0;
				extractor_rod_stage = ExtractorRodStage.CLOSED;
			}
		}
		if(extractor_rod_stage == ExtractorRodStage.OPENING){
			extractor_rod_amount += Time.deltaTime * 10.0;
			if(extractor_rod_amount >= 1.0){
				extractor_rod_amount = 1.0;
				extractor_rod_stage = ExtractorRodStage.OPEN;
			}
		}
		if(extractor_rod_stage == ExtractorRodStage.OPENING || extractor_rod_stage == ExtractorRodStage.OPEN){
			extractor_rod_stage = ExtractorRodStage.CLOSING;
		}
			
		var yolk_pivot = transform.FindChild("yolk_pivot");
		yolk_pivot.localRotation = Quaternion.Slerp(yolk_pivot_rel_rot, 
			transform.FindChild("point_yolk_pivot_open").localRotation,
			yolk_open);
		var cylinder_assembly = yolk_pivot.FindChild("yolk").FindChild("cylinder_assembly");
		cylinder_assembly.localRotation.eulerAngles.z = cylinder_rotation;	
		var extractor_rod = cylinder_assembly.FindChild("extractor_rod");
		extractor_rod.localPosition = Vector3.Lerp(
			extractor_rod_rel_pos, 
			cylinder_assembly.FindChild("point_extractor_rod_extended").localPosition,
		    extractor_rod_amount);	
	
		for(var i=0; i<cylinder_capacity; ++i){
			var name = "point_chamber_"+(i+1);
			var bullet_chamber = extractor_rod.FindChild(name);
			cylinder_bullets[i].transform.position = bullet_chamber.position;
			cylinder_bullets[i].transform.rotation = bullet_chamber.rotation;
		}
	}
}

function FixedUpdate() {
	velocity = (transform.position - old_pos) / Time.deltaTime;
	old_pos = transform.position;
}